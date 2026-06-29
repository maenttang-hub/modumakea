import type { CompileJobRequest, CompileJobResponse } from '@/types';
import { getCompileBackendSharedToken } from '@/lib/compile-policy';
import { fetchWithRetry } from '@/lib/server/api-request';
import {
  buildCompileQueuePollPath,
  enqueueCompileJob,
} from '@/lib/server/compile-queue-store';

export type CompileDispatchMode = 'direct-http' | 'queue';

export interface CompileDispatchResult {
  httpStatus: number;
  result: CompileJobResponse;
}

export interface CompileJobDispatcher {
  readonly mode: CompileDispatchMode;
  submit: (payload: CompileJobRequest, requestId?: string) => Promise<CompileDispatchResult>;
}

function getCompileServerUrl() {
  return (process.env.MODUMAKE_COMPILE_SERVER_URL?.trim() || 'http://127.0.0.1:4100').replace(
    /\/+$/,
    ''
  );
}

function getCompileDispatchMode(): CompileDispatchMode {
  const raw = process.env.MODUMAKE_COMPILE_DISPATCH_MODE?.trim().toLowerCase();
  return raw === 'queue' ? 'queue' : 'direct-http';
}

export async function submitCompileJobDirectHttp(
  payload: CompileJobRequest,
  requestId?: string
): Promise<CompileDispatchResult> {
  const sharedToken = getCompileBackendSharedToken();
  const response = await fetchWithRetry(
    `${getCompileServerUrl()}/api/v1/compile/job`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sharedToken ? { 'x-modumake-compile-token': sharedToken } : {}),
      },
      body: JSON.stringify(payload),
    },
    {
      requestId: requestId ?? `compile-${Date.now()}`,
      retries: 2,
    }
  );

  let data: CompileJobResponse | { errorDetails?: string } | null = null;
  try {
    data = (await response.json()) as CompileJobResponse;
  } catch {
    data = null;
  }

  if (!data) {
    throw new Error(`컴파일 백엔드 응답을 해석할 수 없습니다. (${response.status})`);
  }

  return {
    httpStatus: response.status,
    result: data as CompileJobResponse,
  };
}

async function submitQueuedCompileJob(
  payload: CompileJobRequest,
  requestId?: string
): Promise<CompileDispatchResult> {
  const queuedJob = await enqueueCompileJob(payload, { requestId });

  return {
    httpStatus: 202,
    result: {
      success: true,
      status: 'COMPILATION_QUEUED',
      buildLogs: 'Compile request accepted into the internal queue.',
      queueJob: {
        queueJobId: queuedJob.queueJobId,
        state: queuedJob.state,
        pollPath: buildCompileQueuePollPath(queuedJob.queueJobId),
      },
    },
  };
}

const directHttpDispatcher: CompileJobDispatcher = {
  mode: 'direct-http',
  submit: submitCompileJobDirectHttp,
};

const queuedDispatcher: CompileJobDispatcher = {
  mode: 'queue',
  submit: submitQueuedCompileJob,
};

export function getCompileJobDispatcher(): CompileJobDispatcher {
  return getCompileDispatchMode() === 'queue' ? queuedDispatcher : directHttpDispatcher;
}
