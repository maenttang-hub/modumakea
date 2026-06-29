import test from 'node:test';
import assert from 'node:assert/strict';

const compilerModule = await import('../services/compile-server/lib/compiler.mjs');
const fqbnModule = await import('../services/compile-server/lib/fqbn-map.mjs');
const runtimePolicyModule = await import('../services/compile-server/lib/runtime-policy.mjs');

test('compile server resolves supported board IDs to FQBNs', () => {
  assert.equal(fqbnModule.resolveFqbnForBoard('uno'), 'arduino:avr:uno');
  assert.equal(fqbnModule.resolveFqbnForBoard('esp32'), 'esp32:esp32:esp32');
  assert.equal(fqbnModule.resolveFqbnForBoard('rpi4'), null);
});

test('compile server sanitizes and deduplicates required library names', () => {
  const libraries = compilerModule.sanitizeRequiredLibraries([
    'Wire',
    ' DHT sensor library ',
    'Wire',
  ]);

  assert.deepEqual(libraries, ['Wire', 'DHT sensor library']);
});

test('compile server rejects unsafe library names', () => {
  assert.throws(
    () => compilerModule.sanitizeRequiredLibraries(['Wire', '"; rm -rf /"']),
    /허용되지 않는 라이브러리 이름/
  );
});

test('compile server validates a clean compile job payload', () => {
  const payload = compilerModule.validateCompileJobRequest({
    jobId: 'job-123',
    boardId: 'uno',
    sourceCode: 'void setup() {} void loop() {}',
    requiredLibraries: ['Wire'],
  });

  assert.equal(payload.fqbn, 'arduino:avr:uno');
  assert.deepEqual(payload.requiredLibraries, ['Wire']);
});

test('compile server normalizes job IDs into safe workspace names', () => {
  const payload = compilerModule.validateCompileJobRequest({
    jobId: ' demo job /../ 42 ',
    boardId: 'uno',
    sourceCode: 'void setup() {} void loop() {}',
    requiredLibraries: [],
  });

  assert.equal(payload.jobId, 'demo-job-42');
});

test('compile server rejects oversized source payloads', () => {
  assert.throws(
    () =>
      compilerModule.validateCompileJobRequest({
        jobId: 'job-big',
        boardId: 'uno',
        sourceCode: 'A'.repeat(30001),
        requiredLibraries: [],
      }),
    /sourceCode가 너무 깁니다/
  );
});

test('compile server prebaked library policy rejects libraries outside allowlist before compile', async () => {
  await assert.rejects(
    () =>
      compilerModule.compileJobWithPolicy(
        {
          jobId: 'job-prebaked-1',
          boardId: 'uno',
          sourceCode: 'void setup() {} void loop() {}',
          requiredLibraries: ['DHT sensor library'],
        },
        {
          libraryInstallMode: 'preinstalled-only',
          allowedLibraries: 'Wire',
        }
      ),
    /prebaked allowlist에 없는 라이브러리입니다/
  );
});

test('compile server runtime policy requires a shared token by default', () => {
  assert.throws(
    () =>
      runtimePolicyModule.validateRuntimePolicy({
        host: '127.0.0.1',
        sharedToken: '',
        allowNonLoopbackHost: false,
      }),
    /SHARED_TOKEN is required/
  );
});

test('compile server runtime policy rejects non-loopback bind without explicit override', () => {
  assert.throws(
    () =>
      runtimePolicyModule.validateRuntimePolicy({
        host: '0.0.0.0',
        sharedToken: 'token',
        allowNonLoopbackHost: false,
      }),
    /Refusing to bind compile server to non-loopback host/
  );
});

test('compile server runtime policy accepts loopback bind with shared token', () => {
  assert.doesNotThrow(() =>
    runtimePolicyModule.validateRuntimePolicy({
      host: '127.0.0.1',
      sharedToken: 'token',
      allowNonLoopbackHost: false,
    })
  );
});

test('compile server authorization helper accepts only matching shared token', () => {
  assert.doesNotThrow(() =>
    runtimePolicyModule.assertAuthorizedRequest(
      {
        headers: {
          'x-modumake-compile-token': 'token',
        },
      },
      'token'
    )
  );

  assert.throws(
    () =>
      runtimePolicyModule.assertAuthorizedRequest(
        {
          headers: {},
        },
        'token'
      ),
    /인증에 실패/
  );
});
