import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  claimNextQueuedCompileJob,
  clearCompileQueueStore,
  enqueueCompileJob,
  getCompileQueueJob,
} from '@/lib/server/compile-queue-store';

async function withFileQueueStore(run: (queueFile: string) => Promise<void>) {
  const previousMode = process.env.MODUMAKE_COMPILE_QUEUE_STORE;
  const previousFile = process.env.MODUMAKE_COMPILE_QUEUE_FILE;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'modumake-compile-queue-'));
  const queueFile = path.join(tempDir, 'queue-store.json');
  process.env.MODUMAKE_COMPILE_QUEUE_STORE = 'file';
  process.env.MODUMAKE_COMPILE_QUEUE_FILE = queueFile;
  await clearCompileQueueStore();

  try {
    await run(queueFile);
  } finally {
    if (previousMode === undefined) {
      delete process.env.MODUMAKE_COMPILE_QUEUE_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_QUEUE_STORE = previousMode;
    }
    if (previousFile === undefined) {
      delete process.env.MODUMAKE_COMPILE_QUEUE_FILE;
    } else {
      process.env.MODUMAKE_COMPILE_QUEUE_FILE = previousFile;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('compile queue store persists jobs to the durable file store while keeping payload internal to API reads', async () => {
  await withFileQueueStore(async queueFile => {
    const job = await enqueueCompileJob({
      jobId: 'job-file-1',
      boardId: 'uno',
      sourceCode: 'void setup() {} void loop() {}',
      requiredLibraries: ['Wire'],
    });

    const storedFile = JSON.parse(await readFile(queueFile, 'utf8')) as {
      jobs: Array<{ queueJobId: string; payload: { sourceCode: string } }>;
    };

    assert.equal(storedFile.jobs.length, 1);
    assert.equal(storedFile.jobs[0].queueJobId, job.queueJobId);
    assert.equal(storedFile.jobs[0].payload.sourceCode, 'void setup() {} void loop() {}');

    const publicJob = await getCompileQueueJob(job.queueJobId);
    assert.equal(publicJob?.queueJobId, job.queueJobId);
    assert.equal('payload' in (publicJob as unknown as Record<string, unknown>), false);
  });
});

test('compile queue store claims the oldest queued job and marks it dispatching', async () => {
  await withFileQueueStore(async () => {
    const first = await enqueueCompileJob({
      jobId: 'job-file-2',
      boardId: 'uno',
      sourceCode: 'void setup() {} void loop() {}',
      requiredLibraries: ['Wire'],
    });
    const second = await enqueueCompileJob({
      jobId: 'job-file-3',
      boardId: 'nano',
      sourceCode: 'void setup() {} void loop() {}',
      requiredLibraries: [],
    });

    const claimed = await claimNextQueuedCompileJob();

    assert.equal(claimed?.queueJobId, first.queueJobId);
    assert.equal(claimed?.state, 'dispatching');

    const firstAfter = await getCompileQueueJob(first.queueJobId);
    const secondAfter = await getCompileQueueJob(second.queueJobId);
    assert.equal(firstAfter?.state, 'dispatching');
    assert.equal(secondAfter?.state, 'queued');
  });
});
