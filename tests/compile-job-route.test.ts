import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCompileQueueStore } from '@/lib/server/compile-queue-store';

const { POST: compileJobPost } = await import('@/app/api/compile/job/route');

test('compile job proxy route forwards compile results from backend', async () => {
  const originalFetch = globalThis.fetch;
  const previous = process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  const previousDispatchMode = process.env.MODUMAKE_COMPILE_DISPATCH_MODE;
  process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = 'true';
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'test-shared-token';
  process.env.MODUMAKE_COMPILE_DISPATCH_MODE = 'direct-http';

  globalThis.fetch = async (_input, init) => {
    assert.equal(
      (init?.headers as Record<string, string> | undefined)?.['x-modumake-compile-token'],
      'test-shared-token'
    );

    return new Response(
      JSON.stringify({
        success: true,
        status: 'COMPILATION_SUCCESS',
        buildLogs: 'Sketch uses 444 bytes',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  };

  try {
    const response = await compileJobPost(
      new Request('http://localhost/api/compile/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 'job-1',
          boardId: 'uno',
          sourceCode: 'void setup() {} void loop() {}',
          requiredLibraries: ['Wire'],
        }),
      })
    );

    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.success, true);
    assert.equal(result.status, 'COMPILATION_SUCCESS');
    assert.equal(result.dispatchMode, 'direct-http');
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
    } else {
      process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = previous;
    }
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
    if (previousDispatchMode === undefined) {
      delete process.env.MODUMAKE_COMPILE_DISPATCH_MODE;
    } else {
      process.env.MODUMAKE_COMPILE_DISPATCH_MODE = previousDispatchMode;
    }
    globalThis.fetch = originalFetch;
  }
});

test('compile job proxy route returns unavailable when backend is unreachable', async () => {
  const originalFetch = globalThis.fetch;
  const previous = process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  const previousDispatchMode = process.env.MODUMAKE_COMPILE_DISPATCH_MODE;
  process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = 'true';
  process.env.MODUMAKE_COMPILE_DISPATCH_MODE = 'direct-http';

  globalThis.fetch = async () => {
    throw new Error('connect ECONNREFUSED');
  };

  try {
    const response = await compileJobPost(
      new Request('http://localhost/api/compile/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 'job-2',
          boardId: 'uno',
          sourceCode: 'void setup() {} void loop() {}',
          requiredLibraries: ['Wire'],
        }),
      })
    );

    assert.equal(response.status, 503);
    const result = await response.json();
    assert.equal(result.success, false);
    assert.equal(result.status, 'COMPILATION_UNAVAILABLE');
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
    } else {
      process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = previous;
    }
    if (previousDispatchMode === undefined) {
      delete process.env.MODUMAKE_COMPILE_DISPATCH_MODE;
    } else {
      process.env.MODUMAKE_COMPILE_DISPATCH_MODE = previousDispatchMode;
    }
    globalThis.fetch = originalFetch;
  }
});

test('compile job proxy route blocks unsandboxed compile by default', async () => {
  const previous = process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;

  try {
    const response = await compileJobPost(
      new Request('http://localhost/api/compile/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 'job-3',
          boardId: 'uno',
          sourceCode: 'void setup() {} void loop() {}',
          requiredLibraries: ['Wire'],
        }),
      })
    );

    assert.equal(response.status, 503);
    const result = await response.json();
    assert.equal(result.success, false);
    assert.equal(result.status, 'COMPILATION_UNAVAILABLE');
    assert.match(result.errorDetails, /샌드박스/);
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
    } else {
      process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = previous;
    }
  }
});

test('compile job proxy route can switch to queue dispatch boundary', async () => {
  const previous = process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
  const previousDispatchMode = process.env.MODUMAKE_COMPILE_DISPATCH_MODE;
  const previousStore = process.env.MODUMAKE_COMPILE_QUEUE_STORE;
  process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = 'true';
  process.env.MODUMAKE_COMPILE_DISPATCH_MODE = 'queue';
  process.env.MODUMAKE_COMPILE_QUEUE_STORE = 'memory';
  await clearCompileQueueStore();

  try {
    const response = await compileJobPost(
      new Request('http://localhost/api/compile/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 'job-4',
          boardId: 'uno',
          sourceCode: 'void setup() {} void loop() {}',
          requiredLibraries: ['Wire'],
        }),
      })
    );

    assert.equal(response.status, 202);
    const result = await response.json();
    assert.equal(result.success, true);
    assert.equal(result.status, 'COMPILATION_QUEUED');
    assert.equal(result.dispatchMode, 'queue');
    assert.equal(typeof result.queueJob?.queueJobId, 'string');
    assert.equal(result.queueJob?.state, 'queued');
    assert.match(result.queueJob?.pollPath ?? '', /\/api\/compile\/job\//);
  } finally {
    if (previous === undefined) {
      delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;
    } else {
      process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = previous;
    }
    if (previousDispatchMode === undefined) {
      delete process.env.MODUMAKE_COMPILE_DISPATCH_MODE;
    } else {
      process.env.MODUMAKE_COMPILE_DISPATCH_MODE = previousDispatchMode;
    }
    if (previousStore === undefined) {
      delete process.env.MODUMAKE_COMPILE_QUEUE_STORE;
    } else {
      process.env.MODUMAKE_COMPILE_QUEUE_STORE = previousStore;
    }
    await clearCompileQueueStore();
  }
});
