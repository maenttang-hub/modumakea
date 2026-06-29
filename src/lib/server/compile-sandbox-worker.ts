import type { CompileJobRequest, CompileJobResponse } from '@/types';
import { getCompileBackendSharedToken } from '@/lib/compile-policy';
import { fetchWithRetry } from '@/lib/server/api-request';
import { runCompileSandboxLaunchRequest } from '@/lib/server/compile-sandbox-runner';

export interface ClaimedLaunchRequestPayload {
  launchRequestId: string;
  queueJobId: string;
  requestId: string;
  ownerKey: string;
  boardId: string;
  requiredLibraries: string[];
  sourceCodeHash: string;
  sourceCodeLength: number;
  state: 'claimed';
  payload: CompileJobRequest;
}

type WorkerCycleStatus =
  | 'idle'
  | 'submitted'
  | 'succeeded'
  | 'failed'
  | 'backend-error';

type SandboxWorkerCompileStatus =
  | CompileJobResponse['status']
  | 'SANDBOX_RUNTIME_ACCEPTED';

export interface CompileSandboxWorkerCycleResult {
  status: WorkerCycleStatus;
  launchRequestId?: string;
  queueJobId?: string;
  compileStatus?: SandboxWorkerCompileStatus;
  errorDetails?: string;
}

function getInternalApiBaseUrl() {
  return (
    process.env.MODUMAKE_INTERNAL_API_BASE_URL?.trim().replace(/\/+$/, '') ||
    'http://127.0.0.1:3000'
  );
}

function buildInternalHeaders() {
  const sharedToken = getCompileBackendSharedToken();
  return {
    'Content-Type': 'application/json',
    ...(sharedToken ? { 'x-modumake-compile-token': sharedToken } : {}),
  };
}

async function readJson<T>(response: Response, errorPrefix: string): Promise<T> {
  let payload: T | { error?: string; errorDetails?: string } | null = null;
  try {
    payload = (await response.json()) as T;
  } catch {
    payload = null;
  }

  if (!payload) {
    throw new Error(`${errorPrefix}: JSON 응답을 해석하지 못했습니다. (${response.status})`);
  }

  return payload as T;
}

export async function claimSandboxLaunchRequest(requestId: string) {
  const response = await fetchWithRetry(
    `${getInternalApiBaseUrl()}/api/internal/compile/sandbox/launch/claim`,
    {
      method: 'POST',
      headers: buildInternalHeaders(),
    },
    { requestId, retries: 1 }
  );

  const payload = await readJson<
    | { success: true; status: 'SANDBOX_LAUNCH_REQUEST_IDLE' }
    | {
        success: true;
        status: 'SANDBOX_LAUNCH_REQUEST_CLAIMED';
        launchRequest: ClaimedLaunchRequestPayload;
      }
  >(response, 'sandbox claim');

  if (response.status !== 200) {
    throw new Error(`sandbox claim failed with ${response.status}`);
  }

  return payload.status === 'SANDBOX_LAUNCH_REQUEST_CLAIMED' ? payload.launchRequest : null;
}

export async function markSandboxLaunchSubmitted(launchRequestId: string, requestId: string) {
  const response = await fetchWithRetry(
    `${getInternalApiBaseUrl()}/api/internal/compile/sandbox/launch/${launchRequestId}`,
    {
      method: 'POST',
      headers: buildInternalHeaders(),
      body: JSON.stringify({ state: 'submitted' }),
    },
    { requestId, retries: 1 }
  );

  if (!response.ok) {
    const payload = await readJson<{ error?: string }>(response, 'sandbox submit');
    throw new Error(payload.error || `sandbox submit failed with ${response.status}`);
  }
}

export async function postSandboxCompileResult(
  launchRequestId: string,
  requestId: string,
  payload: {
    state: 'running' | 'succeeded' | 'failed';
    buildLogs?: string;
    errorDetails?: string;
    hexBinary?: string;
  }
) {
  const response = await fetchWithRetry(
    `${getInternalApiBaseUrl()}/api/internal/compile/sandbox/launch/${launchRequestId}/result`,
    {
      method: 'POST',
      headers: buildInternalHeaders(),
      body: JSON.stringify(payload),
    },
    { requestId, retries: 1 }
  );

  if (!response.ok) {
    const body = await readJson<{ error?: string }>(response, 'sandbox result');
    throw new Error(body.error || `sandbox result failed with ${response.status}`);
  }
}

export async function runCompileSandboxWorkerCycle(
  requestId = `sandbox-worker-${Date.now()}`
): Promise<CompileSandboxWorkerCycleResult> {
  const launchRequest = await claimSandboxLaunchRequest(requestId);
  if (!launchRequest) {
    return { status: 'idle' };
  }

  await markSandboxLaunchSubmitted(launchRequest.launchRequestId, requestId);
  await postSandboxCompileResult(launchRequest.launchRequestId, requestId, {
    state: 'running',
    buildLogs: 'sandbox worker picked up the launch request.',
  });

  try {
    const runnerResult = await runCompileSandboxLaunchRequest(launchRequest, requestId);

    if (runnerResult.kind === 'accepted') {
      return {
        status: 'submitted',
        launchRequestId: launchRequest.launchRequestId,
        queueJobId: launchRequest.queueJobId,
        compileStatus: runnerResult.backendStatus,
      };
    }

    const terminalState = runnerResult.result.success && runnerResult.result.status === 'COMPILATION_SUCCESS'
      ? 'succeeded'
      : 'failed';

    await postSandboxCompileResult(launchRequest.launchRequestId, requestId, {
      state: terminalState,
      buildLogs: runnerResult.result.buildLogs,
      errorDetails: runnerResult.result.errorDetails,
      hexBinary: runnerResult.result.hexBinary,
    });

    return {
      status: terminalState,
      launchRequestId: launchRequest.launchRequestId,
      queueJobId: launchRequest.queueJobId,
      compileStatus: runnerResult.result.status,
      errorDetails: runnerResult.result.errorDetails,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sandbox worker compile failed.';
    await postSandboxCompileResult(launchRequest.launchRequestId, requestId, {
      state: 'failed',
      errorDetails: message,
      buildLogs: '',
    });

    return {
      status: 'backend-error',
      launchRequestId: launchRequest.launchRequestId,
      queueJobId: launchRequest.queueJobId,
      compileStatus: 'COMPILATION_UNAVAILABLE',
      errorDetails: message,
    };
  }
}

export async function runCompileSandboxWorker(options?: {
  maxJobs?: number;
  idleDelayMs?: number;
}) {
  const maxJobs = Math.max(1, options?.maxJobs ?? Number(process.env.MODUMAKE_COMPILE_WORKER_MAX_JOBS || 1));
  const idleDelayMs = Math.max(
    0,
    options?.idleDelayMs ?? Number(process.env.MODUMAKE_COMPILE_WORKER_POLL_INTERVAL_MS || 3000)
  );

  const results: CompileSandboxWorkerCycleResult[] = [];
  for (let processed = 0; processed < maxJobs; processed += 1) {
    const result = await runCompileSandboxWorkerCycle(
      `sandbox-worker-${Date.now()}-${processed}`
    );
    results.push(result);
    if (result.status === 'idle') {
      if (processed === 0 && idleDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, idleDelayMs));
      }
      break;
    }
  }

  return results;
}
