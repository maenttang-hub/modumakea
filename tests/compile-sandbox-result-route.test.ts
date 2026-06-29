import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearCompileQueueStore,
  enqueueCompileJob,
} from '@/lib/server/compile-queue-store';
import {
  claimNextCompileSandboxLaunchRequest,
  clearCompileSandboxLaunchRequestStore,
  enqueueCompileSandboxLaunchRequest,
} from '@/lib/server/compile-sandbox-request-store';
import { clearCompileResultStore } from '@/lib/server/compile-result-store';

const { POST: resultPost } = await import(
  '@/app/api/internal/compile/sandbox/launch/[launchRequestId]/result/route'
);
const { GET: compileJobStatusGet } = await import('@/app/api/compile/job/[jobId]/route');
const { GET: compileArtifactGet } = await import('@/app/api/compile/artifact/[artifactId]/route');

test('sandbox result route records running and terminal results in separate stores and exposes latest result on queue status', async () => {
  const previousQueueStore = process.env.MODUMAKE_COMPILE_QUEUE_STORE;
  const previousSandboxStore = process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE;
  const previousResultStore = process.env.MODUMAKE_COMPILE_RESULT_STORE;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  process.env.MODUMAKE_COMPILE_QUEUE_STORE = 'memory';
  process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE = 'memory';
  process.env.MODUMAKE_COMPILE_RESULT_STORE = 'memory';
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'result-token';
  await clearCompileQueueStore();
  await clearCompileSandboxLaunchRequestStore();
  await clearCompileResultStore();

  try {
    const job = await enqueueCompileJob({
      jobId: 'result-job-1',
      boardId: 'uno',
      sourceCode: 'void setup() {} void loop() {}',
      requiredLibraries: ['Wire'],
    });

    const launchRequest = await enqueueCompileSandboxLaunchRequest({
      queueJobId: job.queueJobId,
      requestId: job.requestId,
      ownerKey: job.ownerKey,
      sourceCodeHash: job.sourceCodeHash,
      sourceCodeLength: job.sourceCodeLength,
      payload: {
        jobId: 'result-job-1',
        boardId: 'uno',
        sourceCode: 'void setup() {} void loop() {}',
        requiredLibraries: ['Wire'],
      },
    });
    await claimNextCompileSandboxLaunchRequest();

    const runningResponse = await resultPost(
      new Request(`http://localhost/api/internal/compile/sandbox/launch/${launchRequest.launchRequestId}/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-modumake-compile-token': 'result-token',
        },
        body: JSON.stringify({ state: 'running', buildLogs: 'compile started' }),
      }),
      { params: Promise.resolve({ launchRequestId: launchRequest.launchRequestId }) }
    );
    assert.equal(runningResponse.status, 200);
    const runningPayload = await runningResponse.json();
    assert.equal(runningPayload.result.state, 'running');

    const successResponse = await resultPost(
      new Request(`http://localhost/api/internal/compile/sandbox/launch/${launchRequest.launchRequestId}/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-modumake-compile-token': 'result-token',
        },
        body: JSON.stringify({
          state: 'succeeded',
          buildLogs: 'Sketch uses 444 bytes',
          hexBinary: 'deadbeef',
        }),
      }),
      { params: Promise.resolve({ launchRequestId: launchRequest.launchRequestId }) }
    );
    assert.equal(successResponse.status, 200);
    const successPayload = await successResponse.json();
    assert.equal(successPayload.result.state, 'succeeded');
    assert.equal(successPayload.artifact.kind, 'hex');

    const statusResponse = await compileJobStatusGet(
      new Request(`http://localhost/api/compile/job/${job.queueJobId}`),
      { params: Promise.resolve({ jobId: job.queueJobId }) }
    );
    assert.equal(statusResponse.status, 200);
    const statusPayload = await statusResponse.json();
    assert.equal(statusPayload.job.state, 'succeeded');
    assert.equal(typeof statusPayload.job.latestResultId, 'string');
    assert.equal(statusPayload.latestResult.state, 'succeeded');
    assert.equal(statusPayload.latestArtifact.kind, 'hex');
    assert.match(statusPayload.latestArtifactDownloadPath, /^\/api\/compile\/artifact\//);

    const artifactUrl = new URL(`http://localhost${statusPayload.latestArtifactDownloadPath}`);
    const artifactResponse = await compileArtifactGet(
      new Request(String(artifactUrl)),
      { params: Promise.resolve({ artifactId: statusPayload.latestArtifact.artifactId }) }
    );
    assert.equal(artifactResponse.status, 200);
    const artifactBytes = Buffer.from(await artifactResponse.arrayBuffer());
    assert.equal(artifactBytes.toString('hex').length > 0, true);
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
    if (previousResultStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_RESULT_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_RESULT_STORE = previousResultStore;
    }
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
    await clearCompileQueueStore();
    await clearCompileSandboxLaunchRequestStore();
    await clearCompileResultStore();
  }
});
