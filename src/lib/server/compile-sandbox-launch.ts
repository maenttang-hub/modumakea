import type { CompileJobResponse } from '@/types';
import type { ClaimedCompileQueueJobRecord } from '@/lib/server/compile-queue-store';
import { submitCompileJobDirectHttp } from '@/lib/server/compile-dispatch';
import { enqueueCompileSandboxLaunchRequest } from '@/lib/server/compile-sandbox-request-store';

export type CompileLaunchMode = 'sandbox-request' | 'direct-http';

export type CompileLaunchProviderResult =
  | {
      kind: 'accepted';
      launchRequestId: string;
    }
  | {
      kind: 'completed';
      httpStatus: number;
      result: CompileJobResponse;
    };

function getCompileLaunchMode(): CompileLaunchMode {
  const raw = process.env.MODUMAKE_COMPILE_LAUNCH_MODE?.trim().toLowerCase();
  return raw === 'direct-http' ? 'direct-http' : 'sandbox-request';
}

async function launchViaSandboxRequest(
  job: ClaimedCompileQueueJobRecord
): Promise<CompileLaunchProviderResult> {
  const launchRequest = await enqueueCompileSandboxLaunchRequest({
    queueJobId: job.queueJobId,
    requestId: job.requestId,
    ownerKey: job.ownerKey,
    sourceCodeHash: job.sourceCodeHash,
    sourceCodeLength: job.sourceCodeLength,
    payload: job.payload,
  });

  return {
    kind: 'accepted',
    launchRequestId: launchRequest.launchRequestId,
  };
}

async function launchViaDirectHttp(
  job: ClaimedCompileQueueJobRecord,
  requestId?: string
): Promise<CompileLaunchProviderResult> {
  const response = await submitCompileJobDirectHttp(job.payload, requestId);
  return {
    kind: 'completed',
    httpStatus: response.httpStatus,
    result: response.result,
  };
}

export async function launchCompileSandboxJob(
  job: ClaimedCompileQueueJobRecord,
  requestId?: string
) {
  return getCompileLaunchMode() === 'direct-http'
    ? launchViaDirectHttp(job, requestId)
    : launchViaSandboxRequest(job);
}
