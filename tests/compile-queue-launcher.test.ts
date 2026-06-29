import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearCompileQueueStore,
  enqueueCompileJob,
  getCompileQueueJob,
} from '@/lib/server/compile-queue-store';
import {
  clearCompileSandboxLaunchRequestStore,
  getCompileSandboxLaunchRequest,
} from '@/lib/server/compile-sandbox-request-store';
import { launchNextCompileJob } from '@/lib/server/compile-queue-launcher';

test('compile queue launcher creates a sandbox launch request and keeps the queue job in dispatching state by default', async () => {
  const previousQueueStore = process.env.MODUMAKE_COMPILE_QUEUE_STORE;
  const previousSandboxStore = process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
  const previousLaunchMode = process.env.MODUMAKE_COMPILE_LAUNCH_MODE;
  process.env.MODUMAKE_COMPILE_QUEUE_STORE = 'memory';
  process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = 'memory';
  delete process.env.MODUMAKE_COMPILE_LAUNCH_MODE;
  await clearCompileQueueStore();
  await clearCompileSandboxLaunchRequestStore();

  try {
    const queuedJob = await enqueueCompileJob({
      jobId: 'launcher-job-1',
      boardId: 'uno',
      sourceCode: 'void setup() {} void loop() {}',
      requiredLibraries: ['Wire'],
    });

    const result = await launchNextCompileJob('req-launch-1');
    const finalJob = await getCompileQueueJob(queuedJob.queueJobId);
    const launchRequest = await getCompileSandboxLaunchRequest(result.launchRequestId ?? '');

    assert.equal(result.launched, true);
    assert.equal(result.queueJobId, queuedJob.queueJobId);
    assert.equal(result.state, 'dispatching');
    assert.equal(result.backendStatus, 'SANDBOX_LAUNCH_QUEUED');
    assert.equal(result.httpStatus, 202);
    assert.equal(typeof result.launchRequestId, 'string');
    assert.equal(finalJob?.state, 'dispatching');
    assert.equal(finalJob?.buildLogs, 'Compile job accepted into the sandbox launch queue.');
    assert.ok(finalJob?.startedAt);
    assert.equal(finalJob?.completedAt, undefined);
    assert.equal(launchRequest?.queueJobId, queuedJob.queueJobId);
    assert.equal(launchRequest?.boardId, 'uno');
    assert.equal(launchRequest?.state, 'pending');
  } finally {
    if (previousQueueStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_QUEUE_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_QUEUE_STORE = previousQueueStore;
    }
    if (previousSandboxStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = previousSandboxStore;
    }
    if (previousLaunchMode === undefined) {
      delete process.env.MODUMAKE_COMPILE_LAUNCH_MODE;
    } else {
      process.env.MODUMAKE_COMPILE_LAUNCH_MODE = previousLaunchMode;
    }
    await clearCompileQueueStore();
    await clearCompileSandboxLaunchRequestStore();
  }
});

test('compile queue launcher can still use direct-http mode as an explicit legacy fallback', async () => {
  const originalFetch = globalThis.fetch;
  const previousQueueStore = process.env.MODUMAKE_COMPILE_QUEUE_STORE;
  const previousLaunchMode = process.env.MODUMAKE_COMPILE_LAUNCH_MODE;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  process.env.MODUMAKE_COMPILE_QUEUE_STORE = 'memory';
  process.env.MODUMAKE_COMPILE_LAUNCH_MODE = 'direct-http';
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'launcher-token';
  await clearCompileQueueStore();

  globalThis.fetch = async (_input, init) => {
    assert.equal(
      (init?.headers as Record<string, string> | undefined)?.['x-modumake-compile-token'],
      'launcher-token'
    );

    return new Response(
      JSON.stringify({
        success: true,
        status: 'COMPILATION_SUCCESS',
        buildLogs: 'Sketch uses 444 bytes',
        hexBinary: 'deadbeef',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const queuedJob = await enqueueCompileJob({
      jobId: 'launcher-job-2',
      boardId: 'uno',
      sourceCode: 'void setup() {} void loop() {}',
      requiredLibraries: ['Wire'],
    });

    const result = await launchNextCompileJob('req-launch-2');
    const finalJob = await getCompileQueueJob(queuedJob.queueJobId);

    assert.equal(result.launched, true);
    assert.equal(result.state, 'succeeded');
    assert.equal(finalJob?.state, 'succeeded');
    assert.equal(finalJob?.buildLogs, 'Sketch uses 444 bytes');
    assert.equal(finalJob?.hexBinary, 'deadbeef');
    assert.ok(finalJob?.completedAt);
  } finally {
    if (previousQueueStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_QUEUE_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_QUEUE_STORE = previousQueueStore;
    }
    if (previousLaunchMode === undefined) {
      delete process.env.MODUMAKE_COMPILE_LAUNCH_MODE;
    } else {
      process.env.MODUMAKE_COMPILE_LAUNCH_MODE = previousLaunchMode;
    }
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
    globalThis.fetch = originalFetch;
    await clearCompileQueueStore();
  }
});

test('compile queue launcher marks the job failed when sandbox launch request creation fails', async () => {
  const previousQueueStore = process.env.MODUMAKE_COMPILE_QUEUE_STORE;
  const previousSandboxStore = process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
  process.env.MODUMAKE_COMPILE_QUEUE_STORE = 'memory';
  process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = 'supabase';
  await clearCompileQueueStore();

  try {
    const queuedJob = await enqueueCompileJob({
      jobId: 'launcher-job-3',
      boardId: 'uno',
      sourceCode: 'void setup() {} void loop() {}',
      requiredLibraries: [],
    });

    const result = await launchNextCompileJob('req-launch-3');
    const finalJob = await getCompileQueueJob(queuedJob.queueJobId);

    assert.equal(result.launched, true);
    assert.equal(result.state, 'failed');
    assert.equal(finalJob?.state, 'failed');
    assert.match(finalJob?.errorDetails ?? '', /Supabase admin client is not configured/);
    assert.ok(finalJob?.completedAt);
  } finally {
    if (previousQueueStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_QUEUE_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_QUEUE_STORE = previousQueueStore;
    }
    if (previousSandboxStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = previousSandboxStore;
    }
    await clearCompileQueueStore();
  }
});

test('compile queue launcher returns idle when no queued jobs exist', async () => {
  const previousQueueStore = process.env.MODUMAKE_COMPILE_QUEUE_STORE;
  process.env.MODUMAKE_COMPILE_QUEUE_STORE = 'memory';
  await clearCompileQueueStore();

  try {
    const result = await launchNextCompileJob('req-launch-4');
    assert.equal(result.launched, false);
  } finally {
    if (previousQueueStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_QUEUE_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_QUEUE_STORE = previousQueueStore;
    }
    await clearCompileQueueStore();
  }
});
