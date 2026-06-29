import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCompileQueueStore, enqueueCompileJob } from '@/lib/server/compile-queue-store';
import {
  clearCompileSandboxLaunchRequestStore,
  getCompileSandboxLaunchRequest,
} from '@/lib/server/compile-sandbox-request-store';

const { POST: launchQueuePost } = await import('@/app/api/internal/compile/queue/launch/route');

test('compile queue launch route rejects unauthorized requests', async () => {
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'route-token';

  try {
    const response = await launchQueuePost(
      new Request('http://localhost/api/internal/compile/queue/launch', {
        method: 'POST',
      })
    );

    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.status, 'UNAUTHORIZED');
  } finally {
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
  }
});

test('compile queue launch route returns idle when there is no queued work', async () => {
  const previousStore = process.env.MODUMAKE_COMPILE_QUEUE_STORE;
  const previousSandboxStore = process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  process.env.MODUMAKE_COMPILE_QUEUE_STORE = 'memory';
  process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = 'memory';
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'route-token';
  await clearCompileQueueStore();
  await clearCompileSandboxLaunchRequestStore();

  try {
    const response = await launchQueuePost(
      new Request('http://localhost/api/internal/compile/queue/launch', {
        method: 'POST',
        headers: {
          'x-modumake-compile-token': 'route-token',
        },
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.status, 'QUEUE_IDLE');
    assert.equal(payload.launched, false);
  } finally {
    if (previousStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_QUEUE_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_QUEUE_STORE = previousStore;
    }
    if (previousSandboxStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = previousSandboxStore;
    }
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
    await clearCompileQueueStore();
    await clearCompileSandboxLaunchRequestStore();
  }
});

test('compile queue launch route creates a sandbox launch request when queued work exists', async () => {
  const previousStore = process.env.MODUMAKE_COMPILE_QUEUE_STORE;
  const previousSandboxStore = process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  process.env.MODUMAKE_COMPILE_QUEUE_STORE = 'memory';
  process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = 'memory';
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'route-token';
  await clearCompileQueueStore();
  await clearCompileSandboxLaunchRequestStore();

  try {
    const queuedJob = await enqueueCompileJob({
      jobId: 'route-queue-job-1',
      boardId: 'uno',
      sourceCode: 'void setup() {} void loop() {}',
      requiredLibraries: ['Wire'],
    });

    const response = await launchQueuePost(
      new Request('http://localhost/api/internal/compile/queue/launch', {
        method: 'POST',
        headers: {
          'x-modumake-compile-token': 'route-token',
        },
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.status, 'QUEUE_JOB_PROCESSED');
    assert.equal(payload.launched, true);
    assert.equal(payload.queueJobId, queuedJob.queueJobId);
    assert.equal(payload.state, 'dispatching');
    assert.equal(payload.backendStatus, 'SANDBOX_LAUNCH_QUEUED');
    assert.equal(typeof payload.launchRequestId, 'string');

    const launchRequest = await getCompileSandboxLaunchRequest(payload.launchRequestId);
    assert.equal(launchRequest?.queueJobId, queuedJob.queueJobId);
  } finally {
    if (previousStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_QUEUE_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_QUEUE_STORE = previousStore;
    }
    if (previousSandboxStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = previousSandboxStore;
    }
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
    await clearCompileQueueStore();
    await clearCompileSandboxLaunchRequestStore();
  }
});
