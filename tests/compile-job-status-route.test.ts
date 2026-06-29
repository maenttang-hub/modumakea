import test from 'node:test';
import assert from 'node:assert/strict';

import { clearCompileQueueStore, enqueueCompileJob } from '@/lib/server/compile-queue-store';

const { GET: compileJobStatusGet } = await import('@/app/api/compile/job/[jobId]/route');

test('compile job status route returns queued job records', async () => {
  const previousStore = process.env.MODUMAKE_COMPILE_QUEUE_STORE;
  process.env.MODUMAKE_COMPILE_QUEUE_STORE = 'memory';
  await clearCompileQueueStore();
  const job = await enqueueCompileJob(
    {
      jobId: 'job-status-1',
      boardId: 'uno',
      sourceCode: 'void setup() {} void loop() {}',
      requiredLibraries: ['Wire'],
    },
    {
      requestId: 'req-status-1',
      ownerKey: 'owner-status-1',
    }
  );

  const response = await compileJobStatusGet(
    new Request(`http://localhost${job.queueJobId}`),
    { params: Promise.resolve({ jobId: job.queueJobId }) }
  );

  try {
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.job.queueJobId, job.queueJobId);
    assert.equal(payload.job.state, 'queued');
    assert.equal(payload.job.boardId, 'uno');
    assert.deepEqual(payload.job.requiredLibraries, ['Wire']);
  } finally {
    if (previousStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_QUEUE_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_QUEUE_STORE = previousStore;
    }
    await clearCompileQueueStore();
  }
});

test('compile job status route returns 404 for missing jobs', async () => {
  const previousStore = process.env.MODUMAKE_COMPILE_QUEUE_STORE;
  process.env.MODUMAKE_COMPILE_QUEUE_STORE = 'memory';
  await clearCompileQueueStore();

  try {
    const response = await compileJobStatusGet(
      new Request('http://localhost/api/compile/job/missing'),
      { params: Promise.resolve({ jobId: 'missing-job-id' }) }
    );

    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.match(payload.error, /찾지 못했습니다/);
  } finally {
    if (previousStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_QUEUE_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_QUEUE_STORE = previousStore;
    }
    await clearCompileQueueStore();
  }
});
