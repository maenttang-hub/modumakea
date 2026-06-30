import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCompileQueueStore } from '@/lib/server/compile-queue-store';
import { clearCompileUsagePolicyState } from '@/lib/server/compile-usage-policy';

const { POST: compileJobPost } = await import('@/app/api/compile/job/route');

const COMPILE_ENV_NAMES = [
  'MODUMAKE_ENABLE_UNSANDBOXED_COMPILE',
  'MODUMAKE_COMPILE_PUBLIC_ENABLED',
  'MODUMAKE_COMPILE_REQUIRE_AUTH',
  'MODUMAKE_COMPILE_RATE_LIMIT_IP_PER_MINUTE',
  'MODUMAKE_COMPILE_RATE_LIMIT_USER_PER_MINUTE',
  'MODUMAKE_COMPILE_QUOTA_USER_PER_HOUR',
  'MODUMAKE_COMPILE_QUOTA_USER_PER_DAY',
  'MODUMAKE_COMPILE_SERVER_SHARED_TOKEN',
  'MODUMAKE_COMPILE_DISPATCH_MODE',
  'MODUMAKE_COMPILE_QUEUE_STORE',
] as const;

type CompileEnvName = (typeof COMPILE_ENV_NAMES)[number];

function snapshotEnv() {
  return Object.fromEntries(
    COMPILE_ENV_NAMES.map(name => [name, process.env[name]])
  ) as Record<CompileEnvName, string | undefined>;
}

function restoreEnv(snapshot: Record<CompileEnvName, string | undefined>) {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[name as CompileEnvName];
    } else {
      process.env[name as CompileEnvName] = value;
    }
  }
}

function enableCompileRouteForTest(overrides?: Partial<Record<CompileEnvName, string>>) {
  process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE = 'true';
  process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED = 'true';
  process.env.MODUMAKE_COMPILE_REQUIRE_AUTH = 'false';
  process.env.MODUMAKE_COMPILE_RATE_LIMIT_IP_PER_MINUTE = '100';
  process.env.MODUMAKE_COMPILE_RATE_LIMIT_USER_PER_MINUTE = '100';
  process.env.MODUMAKE_COMPILE_QUOTA_USER_PER_HOUR = '100';
  process.env.MODUMAKE_COMPILE_QUOTA_USER_PER_DAY = '100';

  for (const [name, value] of Object.entries(overrides ?? {})) {
    if (value !== undefined) {
      process.env[name as CompileEnvName] = value;
    }
  }
}

function buildCompileRequest(jobId: string, headers?: Record<string, string>) {
  return new Request('http://localhost/api/compile/job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify({
      jobId,
      boardId: 'uno',
      sourceCode: 'void setup() {} void loop() {}',
      requiredLibraries: ['Wire'],
    }),
  });
}

test('compile job proxy route forwards compile results from backend', async () => {
  const originalFetch = globalThis.fetch;
  const envSnapshot = snapshotEnv();
  await clearCompileQueueStore();
  clearCompileUsagePolicyState();
  enableCompileRouteForTest({
    MODUMAKE_COMPILE_SERVER_SHARED_TOKEN: 'test-shared-token',
    MODUMAKE_COMPILE_DISPATCH_MODE: 'direct-http',
  });

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
    const response = await compileJobPost(buildCompileRequest('job-1'));

    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.success, true);
    assert.equal(result.status, 'COMPILATION_SUCCESS');
    assert.equal(result.dispatchMode, 'direct-http');
  } finally {
    restoreEnv(envSnapshot);
    clearCompileUsagePolicyState();
    await clearCompileQueueStore();
    globalThis.fetch = originalFetch;
  }
});

test('compile job proxy route returns unavailable when backend is unreachable', async () => {
  const originalFetch = globalThis.fetch;
  const envSnapshot = snapshotEnv();
  clearCompileUsagePolicyState();
  enableCompileRouteForTest({
    MODUMAKE_COMPILE_DISPATCH_MODE: 'direct-http',
  });

  globalThis.fetch = async () => {
    throw new Error('connect ECONNREFUSED');
  };

  try {
    const response = await compileJobPost(buildCompileRequest('job-2'));

    assert.equal(response.status, 503);
    const result = await response.json();
    assert.equal(result.success, false);
    assert.equal(result.status, 'COMPILATION_UNAVAILABLE');
  } finally {
    restoreEnv(envSnapshot);
    clearCompileUsagePolicyState();
    globalThis.fetch = originalFetch;
  }
});

test('compile job proxy route blocks public compile by default', async () => {
  const envSnapshot = snapshotEnv();
  clearCompileUsagePolicyState();
  delete process.env.MODUMAKE_COMPILE_PUBLIC_ENABLED;
  delete process.env.MODUMAKE_ENABLE_UNSANDBOXED_COMPILE;

  try {
    const response = await compileJobPost(buildCompileRequest('job-3'));

    assert.equal(response.status, 503);
    const result = await response.json();
    assert.equal(result.success, false);
    assert.equal(result.status, 'COMPILATION_UNAVAILABLE');
    assert.equal(result.errorCode, 'COMPILE_PUBLIC_DISABLED');
    assert.match(result.errorDetails, /MVP|public cloud compile/);
  } finally {
    restoreEnv(envSnapshot);
    clearCompileUsagePolicyState();
  }
});

test('compile job proxy route requires an authenticated requester when enabled', async () => {
  const envSnapshot = snapshotEnv();
  clearCompileUsagePolicyState();
  enableCompileRouteForTest({
    MODUMAKE_COMPILE_REQUIRE_AUTH: 'true',
  });

  try {
    const response = await compileJobPost(buildCompileRequest('job-auth'));

    assert.equal(response.status, 401);
    const result = await response.json();
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'COMPILE_AUTH_REQUIRED');
  } finally {
    restoreEnv(envSnapshot);
    clearCompileUsagePolicyState();
  }
});

test('compile job proxy route applies per-IP rate limits', async () => {
  const envSnapshot = snapshotEnv();
  await clearCompileQueueStore();
  clearCompileUsagePolicyState();
  enableCompileRouteForTest({
    MODUMAKE_COMPILE_DISPATCH_MODE: 'queue',
    MODUMAKE_COMPILE_QUEUE_STORE: 'memory',
    MODUMAKE_COMPILE_RATE_LIMIT_IP_PER_MINUTE: '1',
  });

  try {
    const headers = { 'x-forwarded-for': '203.0.113.9' };
    const first = await compileJobPost(buildCompileRequest('job-rate-1', headers));
    const second = await compileJobPost(buildCompileRequest('job-rate-2', headers));

    assert.equal(first.status, 202);
    assert.equal(second.status, 429);
    assert.equal(second.headers.has('Retry-After'), true);
    const result = await second.json();
    assert.equal(result.errorCode, 'COMPILE_RATE_LIMITED');
  } finally {
    restoreEnv(envSnapshot);
    clearCompileUsagePolicyState();
    await clearCompileQueueStore();
  }
});

test('compile job proxy route applies per-user hourly quota', async () => {
  const envSnapshot = snapshotEnv();
  await clearCompileQueueStore();
  clearCompileUsagePolicyState();
  enableCompileRouteForTest({
    MODUMAKE_COMPILE_DISPATCH_MODE: 'queue',
    MODUMAKE_COMPILE_QUEUE_STORE: 'memory',
    MODUMAKE_COMPILE_REQUIRE_AUTH: 'true',
    MODUMAKE_COMPILE_QUOTA_USER_PER_HOUR: '1',
  });

  try {
    const headers = { 'x-modumake-user-id': 'qa-user-1' };
    const first = await compileJobPost(buildCompileRequest('job-quota-1', headers));
    const second = await compileJobPost(buildCompileRequest('job-quota-2', headers));

    assert.equal(first.status, 202);
    assert.equal(second.status, 429);
    assert.equal(second.headers.has('Retry-After'), true);
    const result = await second.json();
    assert.equal(result.errorCode, 'COMPILE_QUOTA_EXCEEDED');
  } finally {
    restoreEnv(envSnapshot);
    clearCompileUsagePolicyState();
    await clearCompileQueueStore();
  }
});

test('compile job proxy route can switch to queue dispatch boundary', async () => {
  const envSnapshot = snapshotEnv();
  await clearCompileQueueStore();
  clearCompileUsagePolicyState();
  enableCompileRouteForTest({
    MODUMAKE_COMPILE_DISPATCH_MODE: 'queue',
    MODUMAKE_COMPILE_QUEUE_STORE: 'memory',
  });

  try {
    const response = await compileJobPost(buildCompileRequest('job-4'));

    assert.equal(response.status, 202);
    const result = await response.json();
    assert.equal(result.success, true);
    assert.equal(result.status, 'COMPILATION_QUEUED');
    assert.equal(result.dispatchMode, 'queue');
    assert.equal(typeof result.queueJob?.queueJobId, 'string');
    assert.equal(result.queueJob?.state, 'queued');
    assert.match(result.queueJob?.pollPath ?? '', /\/api\/compile\/job\//);
  } finally {
    restoreEnv(envSnapshot);
    clearCompileUsagePolicyState();
    await clearCompileQueueStore();
  }
});
