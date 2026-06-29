import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearCompileResultStore,
  getCompileArtifact,
  getCompileExecutionResult,
  listCompileExecutionResultsForQueueJob,
  recordCompileExecutionResult,
} from '@/lib/server/compile-result-store';

test('compile result store records separated result and artifact data', async () => {
  const previousStore = process.env.MODUMAKE_COMPILE_RESULT_STORE;
  process.env.MODUMAKE_COMPILE_RESULT_STORE = 'memory';
  await clearCompileResultStore();

  try {
    const { result, artifact } = await recordCompileExecutionResult({
      launchRequestId: 'launch-1',
      queueJobId: 'queue-1',
      state: 'succeeded',
      buildLogs: 'Sketch uses 444 bytes',
      hexBinary: 'deadbeef',
    });

    const storedResult = await getCompileExecutionResult(result.resultId);
    const storedArtifact = artifact ? await getCompileArtifact(artifact.artifactId) : null;
    const queueResults = await listCompileExecutionResultsForQueueJob('queue-1');

    assert.equal(storedResult?.resultId, result.resultId);
    assert.equal(storedResult?.primaryArtifactId, artifact?.artifactId);
    assert.equal(storedArtifact?.artifactId, artifact?.artifactId);
    assert.equal(storedArtifact?.kind, 'hex');
    assert.equal(queueResults.length, 1);
    assert.equal(queueResults[0]?.state, 'succeeded');
  } finally {
    if (previousStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_RESULT_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_RESULT_STORE = previousStore;
    }
    await clearCompileResultStore();
  }
});
