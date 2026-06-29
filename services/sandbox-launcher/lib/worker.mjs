import {
  claimNextSandboxLaunchJob,
  updateSandboxLaunchJobState,
} from './launcher.mjs';
import { executeDockerOneShotSandbox } from './docker-runner.mjs';

function getCompileServerUrl(env = process.env) {
  return (env.MODUMAKE_COMPILE_SERVER_URL?.trim() || 'http://127.0.0.1:4100').replace(/\/+$/, '');
}

function getCompileSharedToken(env = process.env) {
  return env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN?.trim() || '';
}

function getSandboxExecutorBackend(env = process.env) {
  const raw = env.MODUMAKE_SANDBOX_EXECUTOR_BACKEND?.trim().toLowerCase();
  if (raw === 'docker-cli-one-shot') {
    return 'docker-cli-one-shot';
  }
  if (raw === 'compile-server-proxy') {
    return 'compile-server-proxy';
  }
  return raw === 'stub-failure' ? 'stub-failure' : 'docker-cli-one-shot';
}

async function submitCompileViaProxy(job, env = process.env) {
  const response = await fetch(`${getCompileServerUrl(env)}/api/v1/compile/job`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getCompileSharedToken(env)
        ? { 'x-modumake-compile-token': getCompileSharedToken(env) }
        : {}),
    },
    body: JSON.stringify(job.payload),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(
      (payload && (payload.errorDetails || payload.error)) ||
        `compile-server proxy returned ${response.status}`
    );
  }

  return payload;
}

async function runSandboxExecutor(job, env = process.env) {
  const backend = getSandboxExecutorBackend(env);
  if (backend === 'stub-failure') {
    return {
      success: false,
      status: 'COMPILATION_UNAVAILABLE',
      buildLogs: '',
      errorDetails: 'sandbox executor backend is not configured.',
    };
  }

  if (backend === 'docker-cli-one-shot') {
    return executeDockerOneShotSandbox(job, { env });
  }

  return submitCompileViaProxy(job, env);
}

async function postCallback(job, payload) {
  const response = await fetch(job.callback.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-modumake-compile-token': job.callback.token,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    throw new Error(
      (errorPayload && (errorPayload.error || errorPayload.errorDetails)) ||
        `sandbox result callback returned ${response.status}`
    );
  }
}

export async function runSandboxLauncherWorkerCycle(env = process.env) {
  const job = await claimNextSandboxLaunchJob(env);
  if (!job) {
    return { status: 'idle' };
  }

  await updateSandboxLaunchJobState(job.launcherJobId, { state: 'submitted' }, env);

  try {
    const result = await runSandboxExecutor(job, env);
    const terminalState =
      result.success && result.status === 'COMPILATION_SUCCESS' ? 'succeeded' : 'failed';

    await postCallback(job, {
      state: terminalState,
      buildLogs: result.buildLogs,
      errorDetails: result.errorDetails,
      hexBinary: result.hexBinary,
    });

    await updateSandboxLaunchJobState(job.launcherJobId, { state: terminalState }, env);
    return {
      status: terminalState,
      launcherJobId: job.launcherJobId,
      queueJobId: job.queueJobId,
      compileStatus: result.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sandbox executor failed';
    await postCallback(job, {
      state: 'failed',
      buildLogs: '',
      errorDetails: message,
    });
    await updateSandboxLaunchJobState(
      job.launcherJobId,
      { state: 'failed', errorDetails: message },
      env
    );
    return {
      status: 'failed',
      launcherJobId: job.launcherJobId,
      queueJobId: job.queueJobId,
      compileStatus: 'COMPILATION_UNAVAILABLE',
      errorDetails: message,
    };
  }
}

export async function runSandboxLauncherWorker(options = {}, env = process.env) {
  const maxJobs = Math.max(1, options.maxJobs ?? Number(env.MODUMAKE_SANDBOX_WORKER_MAX_JOBS || 1));
  const results = [];
  for (let index = 0; index < maxJobs; index += 1) {
    const result = await runSandboxLauncherWorkerCycle(env);
    results.push(result);
    if (result.status === 'idle') {
      break;
    }
  }
  return results;
}
