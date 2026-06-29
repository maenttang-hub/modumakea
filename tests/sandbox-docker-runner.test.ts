import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dockerRunnerModule = await import('../services/sandbox-launcher/lib/docker-runner.mjs');

test('docker sandbox runner builds one-shot container arguments with hardened flags', () => {
  const built = dockerRunnerModule.buildDockerRunArgs({
    launcherJobId: 'launcher-1',
    queueJobId: 'queue-1',
    runtimeSpec: {
      imageRef: 'modumake/compile-sandbox-runtime:local',
      nonRootUser: '10001:10001',
      workspace: {
        root: '/tmp/workspace-1',
      },
      resources: {
        cpuLimit: '1',
        memoryLimitMb: 512,
        pidsLimit: 128,
        diskLimitMb: 256,
        wallClockTimeoutMs: 20000,
      },
      networkPolicy: {
        compilePhase: 'disabled',
      },
    },
  });

  assert.equal(built.timeoutMs, 20000);
  assert.equal(built.args.includes('--read-only'), true);
  assert.equal(built.args.includes('--cap-drop'), true);
  assert.equal(built.args.includes('ALL'), true);
  assert.equal(built.args.includes('--network'), true);
  assert.equal(built.args.includes('none'), true);
  assert.equal(built.args.includes('--security-opt'), true);
  assert.equal(built.args.includes('no-new-privileges:true'), true);
});

test('docker sandbox runner executes one-shot job and reads result payload from workspace', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'modumake-docker-runner-'));

  const workspaceRoot = path.join(tempDir, 'workspaces');

  try {
    const result = await dockerRunnerModule.executeDockerOneShotSandbox(
      {
        launcherJobId: 'launcher-2',
        queueJobId: 'queue-2',
        payload: {
          jobId: 'job-2',
          boardId: 'uno',
          sourceCode: 'void setup() {} void loop() {}',
          requiredLibraries: [],
        },
        runtimeSpec: {
          imageRef: 'modumake/compile-sandbox-runtime:local',
          nonRootUser: '10001:10001',
          workspace: {
            root: '/will-be-overridden',
          },
          resources: {
            cpuLimit: '1',
            memoryLimitMb: 512,
            pidsLimit: 128,
            diskLimitMb: 256,
            wallClockTimeoutMs: 20000,
          },
          networkPolicy: {
            compilePhase: 'disabled',
          },
        },
      },
      {
        env: {
          MODUMAKE_SANDBOX_LAUNCH_WORKSPACE_ROOT: workspaceRoot,
          MODUMAKE_SANDBOX_KEEP_WORKSPACE: 'true',
        },
        execFileImpl: async () => {
          const jobDir = path.join(workspaceRoot, 'launcher-2');
          const payloadRaw = await readFile(path.join(jobDir, 'job.json'), 'utf8');
          const payload = JSON.parse(payloadRaw);
          assert.equal(payload.jobId, 'job-2');
          await writeFile(
            path.join(jobDir, 'result.json'),
            `${JSON.stringify({
              success: true,
              status: 'COMPILATION_SUCCESS',
              buildLogs: 'ok',
              hexBinary: 'deadbeef',
            })}\n`,
            'utf8'
          );
          return { stdout: '', stderr: '' };
        },
      }
    );

    assert.equal(result.success, true);
    assert.equal(result.status, 'COMPILATION_SUCCESS');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
