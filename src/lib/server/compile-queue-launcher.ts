import {
  claimNextQueuedCompileJob,
  updateCompileQueueJobState,
} from '@/lib/server/compile-queue-store';
import { launchCompileSandboxJob } from '@/lib/server/compile-sandbox-launch';

export interface CompileQueueLaunchResult {
  launched: boolean;
  launchRequestId?: string;
  queueJobId?: string;
  state?: 'dispatching' | 'running' | 'succeeded' | 'failed';
  backendStatus?: string;
  httpStatus?: number;
  errorDetails?: string;
}

export async function launchNextCompileJob(requestId?: string): Promise<CompileQueueLaunchResult> {
  const claimedJob = await claimNextQueuedCompileJob();
  if (!claimedJob) {
    return { launched: false };
  }

  try {
    const launchResult = await launchCompileSandboxJob(claimedJob, requestId);

    if (launchResult.kind === 'accepted') {
      await updateCompileQueueJobState(claimedJob.queueJobId, {
        state: 'dispatching',
        buildLogs: 'Compile job accepted into the sandbox launch queue.',
      });

      return {
        launched: true,
        launchRequestId: launchResult.launchRequestId,
        queueJobId: claimedJob.queueJobId,
        state: 'dispatching',
        backendStatus: 'SANDBOX_LAUNCH_QUEUED',
        httpStatus: 202,
      };
    }

    await updateCompileQueueJobState(claimedJob.queueJobId, {
      state: 'running',
      buildLogs: 'Compile job dispatched from queue to the internal compile backend.',
    });

    const succeeded =
      launchResult.result.success && launchResult.result.status === 'COMPILATION_SUCCESS';
    const nextState = succeeded ? 'succeeded' : 'failed';

    await updateCompileQueueJobState(claimedJob.queueJobId, {
      state: nextState,
      buildLogs: launchResult.result.buildLogs,
      errorDetails: launchResult.result.errorDetails,
      hexBinary: launchResult.result.hexBinary,
    });

    return {
      launched: true,
      queueJobId: claimedJob.queueJobId,
      state: nextState,
      backendStatus: launchResult.result.status,
      httpStatus: launchResult.httpStatus,
      errorDetails: launchResult.result.errorDetails,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '내부 컴파일 실행 중 오류가 발생했습니다.';
    await updateCompileQueueJobState(claimedJob.queueJobId, {
      state: 'failed',
      errorDetails: message,
      buildLogs: '',
    });

    return {
      launched: true,
      queueJobId: claimedJob.queueJobId,
      state: 'failed',
      backendStatus: 'COMPILATION_UNAVAILABLE',
      httpStatus: 503,
      errorDetails: message,
    };
  }
}
