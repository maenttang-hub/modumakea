import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimNextCompileSandboxLaunchRequest,
  clearCompileSandboxLaunchRequestStore,
  enqueueCompileSandboxLaunchRequest,
  getCompileSandboxLaunchRequest,
  updateCompileSandboxLaunchRequestState,
} from '@/lib/server/compile-sandbox-request-store';

test('sandbox launch request store persists internal payload while keeping API reads payload-free', async () => {
  const previousStore = process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
  process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = 'memory';
  await clearCompileSandboxLaunchRequestStore();

  try {
    const request = await enqueueCompileSandboxLaunchRequest({
      queueJobId: 'queue-1',
      requestId: 'req-sandbox-1',
      ownerKey: 'owner-1',
      sourceCodeHash: 'hash-1',
      sourceCodeLength: 28,
      payload: {
        jobId: 'job-1',
        boardId: 'uno',
        sourceCode: 'void setup() {} void loop() {}',
        requiredLibraries: ['Wire'],
      },
    });

    const publicRequest = await getCompileSandboxLaunchRequest(request.launchRequestId);
    assert.equal(publicRequest?.launchRequestId, request.launchRequestId);
    assert.equal(publicRequest?.boardId, 'uno');
    assert.equal(publicRequest?.state, 'pending');
    assert.equal('payload' in (publicRequest as Record<string, unknown>), false);
  } finally {
    if (previousStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = previousStore;
    }
    await clearCompileSandboxLaunchRequestStore();
  }
});

test('sandbox launch request store claims the oldest pending request and updates submitted state', async () => {
  const previousStore = process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
  process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = 'memory';
  await clearCompileSandboxLaunchRequestStore();

  try {
    const first = await enqueueCompileSandboxLaunchRequest({
      queueJobId: 'queue-2',
      requestId: 'req-sandbox-2',
      ownerKey: 'owner-2',
      sourceCodeHash: 'hash-2',
      sourceCodeLength: 28,
      payload: {
        jobId: 'job-2',
        boardId: 'uno',
        sourceCode: 'void setup() {} void loop() {}',
        requiredLibraries: [],
      },
    });
    await enqueueCompileSandboxLaunchRequest({
      queueJobId: 'queue-3',
      requestId: 'req-sandbox-3',
      ownerKey: 'owner-3',
      sourceCodeHash: 'hash-3',
      sourceCodeLength: 28,
      payload: {
        jobId: 'job-3',
        boardId: 'nano',
        sourceCode: 'void setup() {} void loop() {}',
        requiredLibraries: ['Wire'],
      },
    });

    const claimed = await claimNextCompileSandboxLaunchRequest();
    assert.equal(claimed?.launchRequestId, first.launchRequestId);
    assert.equal(claimed?.state, 'claimed');
    assert.equal(claimed?.payload.boardId, 'uno');

    const submitted = await updateCompileSandboxLaunchRequestState(first.launchRequestId, {
      state: 'submitted',
    });
    assert.equal(submitted?.state, 'submitted');
    assert.ok(submitted?.submittedAt);
  } finally {
    if (previousStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = previousStore;
    }
    await clearCompileSandboxLaunchRequestStore();
  }
});
