import type { CompileJobResponse } from '@/types';
import { submitCompileJobDirectHttp } from '@/lib/server/compile-dispatch';
import type { ClaimedLaunchRequestPayload } from '@/lib/server/compile-sandbox-worker';
import { getCompileBackendSharedToken } from '@/lib/compile-policy';
import { fetchWithRetry } from '@/lib/server/api-request';

export type CompileSandboxRunnerBackend =
  | 'placeholder-compile-server'
  | 'one-shot-sandbox-launcher'
  | 'stub-failure';

export type CompileSandboxRunnerResult =
  | {
      kind: 'accepted';
      launcherJobId?: string;
      backendStatus: 'SANDBOX_RUNTIME_ACCEPTED';
    }
  | {
      kind: 'completed';
      result: CompileJobResponse;
    };

type SandboxLauncherAcceptedResponse = {
  success: true;
  status: 'SANDBOX_RUNTIME_ACCEPTED';
  launcherJobId?: string;
};

type SandboxLauncherErrorResponse = {
  error?: string;
  errorDetails?: string;
};

type SandboxLauncherResponse = SandboxLauncherAcceptedResponse | SandboxLauncherErrorResponse;

function isSandboxLauncherAcceptedResponse(
  payload: SandboxLauncherResponse | null
): payload is SandboxLauncherAcceptedResponse {
  return Boolean(payload && 'status' in payload && payload.status === 'SANDBOX_RUNTIME_ACCEPTED');
}

function getCompileSandboxRunnerBackend(): CompileSandboxRunnerBackend {
  const raw = process.env.MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND?.trim().toLowerCase();
  if (raw === 'one-shot-sandbox-launcher') {
    return 'one-shot-sandbox-launcher';
  }
  return raw === 'stub-failure' ? 'stub-failure' : 'placeholder-compile-server';
}

function getSandboxLauncherUrl() {
  const raw = process.env.MODUMAKE_COMPILE_SANDBOX_LAUNCHER_URL?.trim();
  if (!raw) {
    throw new Error('MODUMAKE_COMPILE_SANDBOX_LAUNCHER_URL is required for one-shot sandbox launcher backend.');
  }
  return raw.replace(/\/+$/, '');
}

function getInternalApiBaseUrl() {
  return (
    process.env.MODUMAKE_INTERNAL_API_BASE_URL?.trim().replace(/\/+$/, '') ||
    'http://127.0.0.1:3000'
  );
}

async function runViaPlaceholderCompileServer(
  launchRequest: ClaimedLaunchRequestPayload,
  requestId?: string
): Promise<CompileSandboxRunnerResult> {
  const { result } = await submitCompileJobDirectHttp(launchRequest.payload, requestId);
  return { kind: 'completed', result };
}

async function runViaOneShotSandboxLauncher(
  launchRequest: ClaimedLaunchRequestPayload,
  requestId?: string
): Promise<CompileSandboxRunnerResult> {
  const sharedToken = getCompileBackendSharedToken();
  const response = await fetchWithRetry(
    `${getSandboxLauncherUrl()}/api/v1/sandbox-launch`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sharedToken ? { 'x-modumake-compile-token': sharedToken } : {}),
      },
      body: JSON.stringify({
        launchRequestId: launchRequest.launchRequestId,
        queueJobId: launchRequest.queueJobId,
        requestId: launchRequest.requestId,
        ownerKey: launchRequest.ownerKey,
        boardId: launchRequest.boardId,
        requiredLibraries: launchRequest.requiredLibraries,
        sourceCodeHash: launchRequest.sourceCodeHash,
        sourceCodeLength: launchRequest.sourceCodeLength,
        payload: launchRequest.payload,
        resultCallback: {
          url: `${getInternalApiBaseUrl()}/api/internal/compile/sandbox/launch/${launchRequest.launchRequestId}/result`,
          token: sharedToken,
        },
      }),
    },
    {
      requestId: requestId ?? launchRequest.requestId,
      retries: 1,
    }
  );

  let payload: SandboxLauncherResponse | null = null;
  try {
    payload = (await response.json()) as SandboxLauncherResponse;
  } catch {
    payload = null;
  }

  if (!response.ok || !isSandboxLauncherAcceptedResponse(payload)) {
    const message =
      (payload && 'errorDetails' in payload && payload.errorDetails) ||
      (payload && 'error' in payload && payload.error) ||
      `sandbox launcher returned ${response.status}`;
    throw new Error(message);
  }

  return {
    kind: 'accepted',
    launcherJobId: payload.launcherJobId,
    backendStatus: 'SANDBOX_RUNTIME_ACCEPTED',
  };
}

async function runViaStubFailure(): Promise<CompileSandboxRunnerResult> {
  return {
    kind: 'completed',
    result: {
      success: false,
      status: 'COMPILATION_UNAVAILABLE',
      buildLogs: '',
      errorDetails: 'sandbox runner backend is not configured.',
    },
  };
}

export async function runCompileSandboxLaunchRequest(
  launchRequest: ClaimedLaunchRequestPayload,
  requestId?: string
) {
  const backend = getCompileSandboxRunnerBackend();
  if (backend === 'stub-failure') {
    return runViaStubFailure();
  }
  if (backend === 'one-shot-sandbox-launcher') {
    return runViaOneShotSandboxLauncher(launchRequest, requestId);
  }
  return runViaPlaceholderCompileServer(launchRequest, requestId);
}
