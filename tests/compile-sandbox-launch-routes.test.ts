import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearCompileSandboxLaunchRequestStore,
  enqueueCompileSandboxLaunchRequest,
} from '@/lib/server/compile-sandbox-request-store';

const { POST: claimPost } = await import('@/app/api/internal/compile/sandbox/launch/claim/route');
const { GET: launchGet, POST: launchUpdatePost } = await import(
  '@/app/api/internal/compile/sandbox/launch/[launchRequestId]/route'
);

test('sandbox launch claim route returns idle when no pending request exists', async () => {
  const previousStore = process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = 'memory';
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'sandbox-token';
  await clearCompileSandboxLaunchRequestStore();

  try {
    const response = await claimPost(
      new Request('http://localhost/api/internal/compile/sandbox/launch/claim', {
        method: 'POST',
        headers: {
          'x-modumake-compile-token': 'sandbox-token',
        },
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.status, 'SANDBOX_LAUNCH_REQUEST_IDLE');
  } finally {
    if (previousStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = previousStore;
    }
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
    await clearCompileSandboxLaunchRequestStore();
  }
});

test('sandbox launch claim route returns claimed launch request payload for worker consumption', async () => {
  const previousStore = process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = 'memory';
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'sandbox-token';
  await clearCompileSandboxLaunchRequestStore();

  try {
    const request = await enqueueCompileSandboxLaunchRequest({
      queueJobId: 'queue-claim-1',
      requestId: 'req-claim-1',
      ownerKey: 'owner-claim-1',
      sourceCodeHash: 'hash-claim-1',
      sourceCodeLength: 28,
      payload: {
        jobId: 'job-claim-1',
        boardId: 'uno',
        sourceCode: 'void setup() {} void loop() {}',
        requiredLibraries: ['Wire'],
      },
    });

    const response = await claimPost(
      new Request('http://localhost/api/internal/compile/sandbox/launch/claim', {
        method: 'POST',
        headers: {
          'x-modumake-compile-token': 'sandbox-token',
        },
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.status, 'SANDBOX_LAUNCH_REQUEST_CLAIMED');
    assert.equal(payload.launchRequest.launchRequestId, request.launchRequestId);
    assert.equal(payload.launchRequest.state, 'claimed');
    assert.equal(payload.launchRequest.payload.boardId, 'uno');
    assert.equal(payload.launchRequest.payload.sourceCode, 'void setup() {} void loop() {}');
  } finally {
    if (previousStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = previousStore;
    }
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
    await clearCompileSandboxLaunchRequestStore();
  }
});

test('sandbox launch update route marks a claimed request submitted and GET returns payload-free status', async () => {
  const previousStore = process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = 'memory';
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'sandbox-token';
  await clearCompileSandboxLaunchRequestStore();

  try {
    const request = await enqueueCompileSandboxLaunchRequest({
      queueJobId: 'queue-claim-2',
      requestId: 'req-claim-2',
      ownerKey: 'owner-claim-2',
      sourceCodeHash: 'hash-claim-2',
      sourceCodeLength: 28,
      payload: {
        jobId: 'job-claim-2',
        boardId: 'nano',
        sourceCode: 'void setup() {} void loop() {}',
        requiredLibraries: [],
      },
    });

    await claimPost(
      new Request('http://localhost/api/internal/compile/sandbox/launch/claim', {
        method: 'POST',
        headers: {
          'x-modumake-compile-token': 'sandbox-token',
        },
      })
    );

    const updateResponse = await launchUpdatePost(
      new Request(`http://localhost/api/internal/compile/sandbox/launch/${request.launchRequestId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-modumake-compile-token': 'sandbox-token',
        },
        body: JSON.stringify({ state: 'submitted' }),
      }),
      { params: Promise.resolve({ launchRequestId: request.launchRequestId }) }
    );

    assert.equal(updateResponse.status, 200);
    const updatePayload = await updateResponse.json();
    assert.equal(updatePayload.success, true);
    assert.equal(updatePayload.status, 'SANDBOX_LAUNCH_REQUEST_SUBMITTED');
    assert.equal(updatePayload.launchRequest.state, 'submitted');

    const getResponse = await launchGet(
      new Request(`http://localhost/api/internal/compile/sandbox/launch/${request.launchRequestId}`, {
        method: 'GET',
        headers: {
          'x-modumake-compile-token': 'sandbox-token',
        },
      }),
      { params: Promise.resolve({ launchRequestId: request.launchRequestId }) }
    );

    assert.equal(getResponse.status, 200);
    const getPayload = await getResponse.json();
    assert.equal(getPayload.success, true);
    assert.equal(getPayload.launchRequest.state, 'submitted');
    assert.equal('payload' in (getPayload.launchRequest as Record<string, unknown>), false);
  } finally {
    if (previousStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = previousStore;
    }
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
    await clearCompileSandboxLaunchRequestStore();
  }
});
