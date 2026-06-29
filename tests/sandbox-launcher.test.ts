import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const launcherModule = await import('../services/sandbox-launcher/lib/launcher.mjs');
const runtimePolicyModule = await import('../services/sandbox-launcher/lib/runtime-policy.mjs');
const workerModule = await import('../services/sandbox-launcher/lib/worker.mjs');

function sandboxEnv(values: Record<string, string> = {}) {
  return values as NodeJS.ProcessEnv;
}

test('sandbox launcher validates a clean launch request payload', () => {
  const payload = launcherModule.validateSandboxLaunchRequest({
    launchRequestId: 'launch-1',
    queueJobId: 'queue-1',
    requestId: 'req-1',
    ownerKey: 'owner-1',
    boardId: 'uno',
    requiredLibraries: ['Wire'],
    sourceCodeHash: 'hash-1',
    sourceCodeLength: 28,
    resultCallback: {
      url: 'http://127.0.0.1:3000/api/internal/compile/sandbox/launch/launch-1/result',
      token: 'token',
    },
    payload: {
      jobId: 'job-1',
      boardId: 'uno',
      sourceCode: 'void setup() {} void loop() {}',
      requiredLibraries: ['Wire'],
    },
  });

  assert.equal(payload.boardId, 'uno');
  assert.deepEqual(payload.requiredLibraries, ['Wire']);
  assert.equal(payload.resultCallback.token, 'token');
});

test('sandbox launcher runtime spec encodes one-shot sandbox constraints', () => {
  const validated = launcherModule.validateSandboxLaunchRequest({
    launchRequestId: 'launch-2',
    queueJobId: 'queue-2',
    requestId: 'req-2',
    ownerKey: 'owner-2',
    boardId: 'uno',
    requiredLibraries: ['Wire'],
    sourceCodeHash: 'hash-2',
    sourceCodeLength: 28,
    resultCallback: {
      url: 'http://127.0.0.1:3000/api/internal/compile/sandbox/launch/launch-2/result',
      token: 'token',
    },
    payload: {
      jobId: 'job-2',
      boardId: 'uno',
      sourceCode: 'void setup() {} void loop() {}',
      requiredLibraries: ['Wire'],
    },
  });

  const spec = launcherModule.buildOneShotRuntimeSpec(validated, sandboxEnv({
    MODUMAKE_SANDBOX_RUNTIME_BACKEND: 'docker-cli-one-shot',
    MODUMAKE_SANDBOX_RUNTIME_IMAGE: 'sandbox-image:test',
    MODUMAKE_SANDBOX_TIMEOUT_MS: '22000',
  }));

  assert.equal(spec.runtimeKind, 'one-shot-sandbox');
  assert.equal(spec.runtimeSpec.workspace.mode, 'tmpfs');
  assert.equal(spec.runtimeSpec.workspace.readOnlyRootFs, true);
  assert.deepEqual(spec.runtimeSpec.security.dropCapabilities, ['ALL']);
  assert.equal(spec.runtimeSpec.networkPolicy.compilePhase, 'disabled');
  assert.equal(spec.runtimeSpec.resources.wallClockTimeoutMs, 22000);
});

test('sandbox launcher can enqueue runtime specs into a durable launch queue file', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'modumake-sandbox-launcher-'));
  const queueFile = path.join(tempDir, 'launch-queue.json');

  try {
    const validated = launcherModule.validateSandboxLaunchRequest({
      launchRequestId: 'launch-3',
      queueJobId: 'queue-3',
      requestId: 'req-3',
      ownerKey: 'owner-3',
      boardId: 'uno',
      requiredLibraries: [],
      sourceCodeHash: 'hash-3',
      sourceCodeLength: 28,
      resultCallback: {
        url: 'http://127.0.0.1:3000/api/internal/compile/sandbox/launch/launch-3/result',
        token: 'token',
      },
      payload: {
        jobId: 'job-3',
        boardId: 'uno',
        sourceCode: 'void setup() {} void loop() {}',
        requiredLibraries: [],
      },
    });

    const spec = launcherModule.buildOneShotRuntimeSpec(validated, sandboxEnv());
    const enqueueResult = await launcherModule.enqueueSandboxLaunchJob(spec, sandboxEnv({
      MODUMAKE_SANDBOX_LAUNCH_QUEUE_FILE: queueFile,
    }));

    assert.equal(enqueueResult.launcherJobId, spec.launcherJobId);
    assert.equal(enqueueResult.queuedJobs, 1);

    const stored = JSON.parse(await readFile(queueFile, 'utf8')) as {
      version: number;
      jobs: Array<{ launcherJobId: string; queueJobId: string; state: string }>;
    };
    assert.equal(stored.version, 1);
    assert.equal(stored.jobs.length, 1);
    assert.equal(stored.jobs[0]?.launcherJobId, spec.launcherJobId);
    assert.equal(stored.jobs[0]?.queueJobId, 'queue-3');
    assert.equal(stored.jobs[0]?.state, 'queued');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('sandbox launcher worker claims queued launch jobs, proxies compile, and posts callback results', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'modumake-sandbox-worker-'));
  const queueFile = path.join(tempDir, 'launch-queue.json');
  const previousFetch = globalThis.fetch;

  try {
    const validated = launcherModule.validateSandboxLaunchRequest({
      launchRequestId: 'launch-4',
      queueJobId: 'queue-4',
      requestId: 'req-4',
      ownerKey: 'owner-4',
      boardId: 'uno',
      requiredLibraries: ['Wire'],
      sourceCodeHash: 'hash-4',
      sourceCodeLength: 28,
      resultCallback: {
        url: 'http://internal.example/api/internal/compile/sandbox/launch/launch-4/result',
        token: 'callback-token',
      },
      payload: {
        jobId: 'job-4',
        boardId: 'uno',
        sourceCode: 'void setup() {} void loop() {}',
        requiredLibraries: ['Wire'],
      },
    });
    const spec = launcherModule.buildOneShotRuntimeSpec(validated, sandboxEnv());
    await launcherModule.enqueueSandboxLaunchJob(spec, sandboxEnv({
      MODUMAKE_SANDBOX_LAUNCH_QUEUE_FILE: queueFile,
    }));

    const seenCallbacks: Array<{ headers: RequestInit['headers']; body: { state: string } }> = [];
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://127.0.0.1:4100/api/v1/compile/job') {
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

      if (url === 'http://internal.example/api/internal/compile/sandbox/launch/launch-4/result') {
        seenCallbacks.push({
          headers: init?.headers,
          body: JSON.parse(String(init?.body)),
        });
        return new Response(
          JSON.stringify({ success: true, status: 'COMPILE_RESULT_RECORDED_SUCCESS' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`unexpected fetch ${url}`);
    };

    const result = await workerModule.runSandboxLauncherWorkerCycle(sandboxEnv({
      MODUMAKE_SANDBOX_LAUNCH_QUEUE_FILE: queueFile,
      MODUMAKE_SANDBOX_EXECUTOR_BACKEND: 'compile-server-proxy',
      MODUMAKE_COMPILE_SERVER_SHARED_TOKEN: 'compile-token',
    }));

    assert.equal(result.status, 'succeeded');
    assert.equal(result.launcherJobId, spec.launcherJobId);
    assert.equal(seenCallbacks.length, 1);
    assert.equal(seenCallbacks[0]?.body.state, 'succeeded');

    const stored = JSON.parse(await readFile(queueFile, 'utf8')) as {
      jobs: Array<{ launcherJobId: string; state: string }>;
    };
    assert.equal(stored.jobs[0]?.state, 'succeeded');
  } finally {
    globalThis.fetch = previousFetch;
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('sandbox launcher runtime policy requires shared token and loopback by default', () => {
  assert.throws(
    () =>
      runtimePolicyModule.validateRuntimePolicy({
        host: '127.0.0.1',
        sharedToken: '',
        allowNonLoopbackHost: false,
      }),
    /SHARED_TOKEN is required/
  );

  assert.throws(
    () =>
      runtimePolicyModule.validateRuntimePolicy({
        host: '0.0.0.0',
        sharedToken: 'token',
        allowNonLoopbackHost: false,
      }),
    /Refusing to bind sandbox launcher to non-loopback host/
  );
});
