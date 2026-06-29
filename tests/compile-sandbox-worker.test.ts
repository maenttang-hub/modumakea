import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runCompileSandboxWorker,
  runCompileSandboxWorkerCycle,
} from '@/lib/server/compile-sandbox-worker';

test('compile sandbox worker returns idle when no launch request is available', async () => {
  const originalFetch = globalThis.fetch;
  const previousBaseUrl = process.env.MODUMAKE_INTERNAL_API_BASE_URL;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  process.env.MODUMAKE_INTERNAL_API_BASE_URL = 'http://internal.example';
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'worker-token';

  globalThis.fetch = async (input) => {
    const url = String(input);
    assert.equal(url, 'http://internal.example/api/internal/compile/sandbox/launch/claim');
    return new Response(
      JSON.stringify({
        success: true,
        status: 'SANDBOX_LAUNCH_REQUEST_IDLE',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const result = await runCompileSandboxWorkerCycle('req-worker-idle');
    assert.equal(result.status, 'idle');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousBaseUrl === undefined) {
      delete process.env.MODUMAKE_INTERNAL_API_BASE_URL;
    } else {
      process.env.MODUMAKE_INTERNAL_API_BASE_URL = previousBaseUrl;
    }
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
  }
});

test('compile sandbox worker skeleton traverses claim -> submitted -> running -> succeeded using the placeholder compile backend', async () => {
  const originalFetch = globalThis.fetch;
  const previousBaseUrl = process.env.MODUMAKE_INTERNAL_API_BASE_URL;
  const previousCompileServerUrl = process.env.MODUMAKE_COMPILE_SERVER_URL;
  const previousRunnerBackend = process.env.MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  process.env.MODUMAKE_INTERNAL_API_BASE_URL = 'http://internal.example';
  process.env.MODUMAKE_COMPILE_SERVER_URL = 'http://compile.example';
  delete process.env.MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND;
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'worker-token';

  const seenStates: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.['x-modumake-compile-token'], 'worker-token');

    if (url === 'http://internal.example/api/internal/compile/sandbox/launch/claim') {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'SANDBOX_LAUNCH_REQUEST_CLAIMED',
          launchRequest: {
            launchRequestId: 'launch-1',
            queueJobId: 'queue-1',
            requestId: 'req-1',
            ownerKey: 'owner-1',
            boardId: 'uno',
            requiredLibraries: ['Wire'],
            sourceCodeHash: 'hash-1',
            sourceCodeLength: 28,
            state: 'claimed',
            payload: {
              jobId: 'job-1',
              boardId: 'uno',
              sourceCode: 'void setup() {} void loop() {}',
              requiredLibraries: ['Wire'],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url === 'http://internal.example/api/internal/compile/sandbox/launch/launch-1') {
      const body = JSON.parse(String(init?.body)) as { state: string };
      assert.equal(body.state, 'submitted');
      return new Response(
        JSON.stringify({ success: true, status: 'SANDBOX_LAUNCH_REQUEST_SUBMITTED' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url === 'http://internal.example/api/internal/compile/sandbox/launch/launch-1/result') {
      const body = JSON.parse(String(init?.body)) as { state: string };
      seenStates.push(body.state);
      return new Response(
        JSON.stringify({ success: true, status: 'COMPILE_RESULT_RECORDED_SUCCESS' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url === 'http://compile.example/api/v1/compile/job') {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'COMPILATION_SUCCESS',
          buildLogs: 'Sketch uses 444 bytes',
          hexBinary: 'deadbeef',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const result = await runCompileSandboxWorkerCycle('req-worker-success');
    assert.equal(result.status, 'succeeded');
    assert.equal(result.launchRequestId, 'launch-1');
    assert.equal(result.queueJobId, 'queue-1');
    assert.equal(result.compileStatus, 'COMPILATION_SUCCESS');
    assert.deepEqual(seenStates, ['running', 'succeeded']);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousBaseUrl === undefined) {
      delete process.env.MODUMAKE_INTERNAL_API_BASE_URL;
    } else {
      process.env.MODUMAKE_INTERNAL_API_BASE_URL = previousBaseUrl;
    }
    if (previousCompileServerUrl === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_URL;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_URL = previousCompileServerUrl;
    }
    if (previousRunnerBackend === undefined) {
      delete process.env.MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND;
    } else {
      process.env.MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND = previousRunnerBackend;
    }
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
  }
});

test('compile sandbox worker can terminate with failed result through the sandbox runner adapter without compile-server fetch', async () => {
  const originalFetch = globalThis.fetch;
  const previousBaseUrl = process.env.MODUMAKE_INTERNAL_API_BASE_URL;
  const previousRunnerBackend = process.env.MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  process.env.MODUMAKE_INTERNAL_API_BASE_URL = 'http://internal.example';
  process.env.MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND = 'stub-failure';
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'worker-token';

  const seenStates: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.['x-modumake-compile-token'], 'worker-token');

    if (url === 'http://internal.example/api/internal/compile/sandbox/launch/claim') {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'SANDBOX_LAUNCH_REQUEST_CLAIMED',
          launchRequest: {
            launchRequestId: 'launch-stub-1',
            queueJobId: 'queue-stub-1',
            requestId: 'req-stub-1',
            ownerKey: 'owner-stub-1',
            boardId: 'uno',
            requiredLibraries: [],
            sourceCodeHash: 'hash-stub-1',
            sourceCodeLength: 28,
            state: 'claimed',
            payload: {
              jobId: 'job-stub-1',
              boardId: 'uno',
              sourceCode: 'void setup() {} void loop() {}',
              requiredLibraries: [],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url === 'http://internal.example/api/internal/compile/sandbox/launch/launch-stub-1') {
      return new Response(
        JSON.stringify({ success: true, status: 'SANDBOX_LAUNCH_REQUEST_SUBMITTED' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url === 'http://internal.example/api/internal/compile/sandbox/launch/launch-stub-1/result') {
      const body = JSON.parse(String(init?.body)) as { state: string };
      seenStates.push(body.state);
      return new Response(
        JSON.stringify({ success: true, status: 'COMPILE_RESULT_RECORDED_FAILURE' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const result = await runCompileSandboxWorkerCycle('req-worker-stub-failure');
    assert.equal(result.status, 'failed');
    assert.equal(result.launchRequestId, 'launch-stub-1');
    assert.equal(result.queueJobId, 'queue-stub-1');
    assert.equal(result.compileStatus, 'COMPILATION_UNAVAILABLE');
    assert.deepEqual(seenStates, ['running', 'failed']);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousBaseUrl === undefined) {
      delete process.env.MODUMAKE_INTERNAL_API_BASE_URL;
    } else {
      process.env.MODUMAKE_INTERNAL_API_BASE_URL = previousBaseUrl;
    }
    if (previousRunnerBackend === undefined) {
      delete process.env.MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND;
    } else {
      process.env.MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND = previousRunnerBackend;
    }
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
  }
});

test('compile sandbox worker can hand off to one-shot sandbox launcher backend and stop at submitted state', async () => {
  const originalFetch = globalThis.fetch;
  const previousBaseUrl = process.env.MODUMAKE_INTERNAL_API_BASE_URL;
  const previousLauncherUrl = process.env.MODUMAKE_COMPILE_SANDBOX_LAUNCHER_URL;
  const previousRunnerBackend = process.env.MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  process.env.MODUMAKE_INTERNAL_API_BASE_URL = 'http://internal.example';
  process.env.MODUMAKE_COMPILE_SANDBOX_LAUNCHER_URL = 'http://launcher.example';
  process.env.MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND = 'one-shot-sandbox-launcher';
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'worker-token';

  const seenStates: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.['x-modumake-compile-token'], 'worker-token');

    if (url === 'http://internal.example/api/internal/compile/sandbox/launch/claim') {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'SANDBOX_LAUNCH_REQUEST_CLAIMED',
          launchRequest: {
            launchRequestId: 'launch-accepted-1',
            queueJobId: 'queue-accepted-1',
            requestId: 'req-accepted-1',
            ownerKey: 'owner-accepted-1',
            boardId: 'uno',
            requiredLibraries: ['Wire'],
            sourceCodeHash: 'hash-accepted-1',
            sourceCodeLength: 28,
            state: 'claimed',
            payload: {
              jobId: 'job-accepted-1',
              boardId: 'uno',
              sourceCode: 'void setup() {} void loop() {}',
              requiredLibraries: ['Wire'],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url === 'http://internal.example/api/internal/compile/sandbox/launch/launch-accepted-1') {
      return new Response(
        JSON.stringify({ success: true, status: 'SANDBOX_LAUNCH_REQUEST_SUBMITTED' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url === 'http://internal.example/api/internal/compile/sandbox/launch/launch-accepted-1/result') {
      const body = JSON.parse(String(init?.body)) as { state: string };
      seenStates.push(body.state);
      return new Response(
        JSON.stringify({ success: true, status: 'COMPILE_RESULT_RECORDED_RUNNING' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url === 'http://launcher.example/api/v1/sandbox-launch') {
      const body = JSON.parse(String(init?.body)) as {
        launchRequestId: string;
        resultCallback: { url: string; token: string };
      };
      assert.equal(body.launchRequestId, 'launch-accepted-1');
      assert.equal(
        body.resultCallback.url,
        'http://internal.example/api/internal/compile/sandbox/launch/launch-accepted-1/result'
      );
      assert.equal(body.resultCallback.token, 'worker-token');
      return new Response(
        JSON.stringify({
          success: true,
          status: 'SANDBOX_RUNTIME_ACCEPTED',
          launcherJobId: 'runtime-123',
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const result = await runCompileSandboxWorkerCycle('req-worker-accepted');
    assert.equal(result.status, 'submitted');
    assert.equal(result.launchRequestId, 'launch-accepted-1');
    assert.equal(result.queueJobId, 'queue-accepted-1');
    assert.equal(result.compileStatus, 'SANDBOX_RUNTIME_ACCEPTED');
    assert.deepEqual(seenStates, ['running']);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousBaseUrl === undefined) {
      delete process.env.MODUMAKE_INTERNAL_API_BASE_URL;
    } else {
      process.env.MODUMAKE_INTERNAL_API_BASE_URL = previousBaseUrl;
    }
    if (previousLauncherUrl === undefined) {
      delete process.env.MODUMAKE_COMPILE_SANDBOX_LAUNCHER_URL;
    } else {
      process.env.MODUMAKE_COMPILE_SANDBOX_LAUNCHER_URL = previousLauncherUrl;
    }
    if (previousRunnerBackend === undefined) {
      delete process.env.MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND;
    } else {
      process.env.MODUMAKE_COMPILE_SANDBOX_RUNNER_BACKEND = previousRunnerBackend;
    }
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
  }
});

test('compile sandbox worker loop stops after first idle cycle', async () => {
  const originalFetch = globalThis.fetch;
  const previousBaseUrl = process.env.MODUMAKE_INTERNAL_API_BASE_URL;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  process.env.MODUMAKE_INTERNAL_API_BASE_URL = 'http://internal.example';
  process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = 'worker-token';

  let claimCount = 0;
  globalThis.fetch = async () => {
    claimCount += 1;
    return new Response(
      JSON.stringify({
        success: true,
        status: 'SANDBOX_LAUNCH_REQUEST_IDLE',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const results = await runCompileSandboxWorker({ maxJobs: 2, idleDelayMs: 0 });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.status, 'idle');
    assert.equal(claimCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousBaseUrl === undefined) {
      delete process.env.MODUMAKE_INTERNAL_API_BASE_URL;
    } else {
      process.env.MODUMAKE_INTERNAL_API_BASE_URL = previousBaseUrl;
    }
    if (previousToken === undefined) {
      delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
    } else {
      process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN = previousToken;
    }
  }
});
