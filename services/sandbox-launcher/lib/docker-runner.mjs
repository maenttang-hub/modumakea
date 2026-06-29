import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function readNonEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toPositiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function getDockerBinary(env = process.env) {
  return readNonEmpty(env.MODUMAKE_SANDBOX_DOCKER_BIN) || 'docker';
}

function getWorkspaceRoot(env = process.env) {
  const configured = readNonEmpty(env.MODUMAKE_SANDBOX_LAUNCH_WORKSPACE_ROOT);
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }

  return path.join(process.cwd(), '.modumake', 'sandbox-launcher-workspaces');
}

function getRuntimeCommand(runtimeSpec, env = process.env) {
  const configured = readNonEmpty(env.MODUMAKE_SANDBOX_RUNTIME_COMMAND);
  if (configured) {
    return configured.split(/\s+/).filter(Boolean);
  }

  return [
    'node',
    '/app/services/sandbox-runtime/execute-job.mjs',
    '/workspace/job.json',
    '/workspace/result.json',
  ];
}

function quoteDockerLabelValue(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 63);
}

export function buildDockerRunArgs(job, env = process.env) {
  const runtimeSpec = job.runtimeSpec;
  const workspaceMount = '/workspace';
  const tmpfsSizeMb = Math.max(runtimeSpec.resources.diskLimitMb, 64);
  const timeoutMs = toPositiveInteger(
    readNonEmpty(env.MODUMAKE_SANDBOX_DOCKER_TIMEOUT_MS) || runtimeSpec.resources.wallClockTimeoutMs,
    runtimeSpec.resources.wallClockTimeoutMs
  );

  const args = [
    'run',
    '--rm',
    '--read-only',
    '--network',
    runtimeSpec.networkPolicy.compilePhase === 'disabled' ? 'none' : 'bridge',
    '--cpus',
    String(runtimeSpec.resources.cpuLimit),
    '--memory',
    `${runtimeSpec.resources.memoryLimitMb}m`,
    '--pids-limit',
    String(runtimeSpec.resources.pidsLimit),
    '--tmpfs',
    `/tmp:rw,noexec,nosuid,size=${tmpfsSizeMb}m`,
    '--mount',
    `type=bind,src=${runtimeSpec.workspace.root},dst=${workspaceMount}`,
    '--workdir',
    workspaceMount,
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--label',
    `modumake.launcher_job_id=${quoteDockerLabelValue(job.launcherJobId)}`,
    '--label',
    `modumake.queue_job_id=${quoteDockerLabelValue(job.queueJobId)}`,
    '--user',
    readNonEmpty(env.MODUMAKE_SANDBOX_RUNTIME_UID_GID) || runtimeSpec.nonRootUser,
  ];

  if (readNonEmpty(runtimeSpec.security?.seccompProfile) && runtimeSpec.security.seccompProfile !== 'default') {
    args.push('--security-opt', `seccomp=${runtimeSpec.security.seccompProfile}`);
  }
  if (readNonEmpty(runtimeSpec.security?.appArmorProfile) && runtimeSpec.security.appArmorProfile !== 'default') {
    args.push('--security-opt', `apparmor=${runtimeSpec.security.appArmorProfile}`);
  }

  args.push(runtimeSpec.imageRef, ...getRuntimeCommand(runtimeSpec, env));

  return {
    timeoutMs,
    args,
  };
}

async function prepareWorkspace(job, env = process.env) {
  const workspaceRoot = path.join(getWorkspaceRoot(env), job.launcherJobId);
  await mkdir(workspaceRoot, { recursive: true });
  await chmod(workspaceRoot, 0o777);
  await writeFile(path.join(workspaceRoot, 'job.json'), `${JSON.stringify(job.payload, null, 2)}\n`, 'utf8');
  return workspaceRoot;
}

async function readResult(workspaceRoot) {
  const raw = await readFile(path.join(workspaceRoot, 'result.json'), 'utf8');
  return JSON.parse(raw);
}

export async function executeDockerOneShotSandbox(
  job,
  options = {}
) {
  const env = options.env ?? process.env;
  const execFileImpl = options.execFileImpl ?? execFileAsync;
  const workspaceRoot = await prepareWorkspace(job, env);

  try {
    const runtimeJob = {
      ...job,
      runtimeSpec: {
        ...job.runtimeSpec,
        workspace: {
          ...job.runtimeSpec.workspace,
          root: workspaceRoot,
        },
      },
    };
    const { args, timeoutMs } = buildDockerRunArgs(runtimeJob, env);
    await execFileImpl(getDockerBinary(env), args, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    return await readResult(workspaceRoot);
  } catch (error) {
    const maybeResult = await readResult(workspaceRoot).catch(() => null);
    if (maybeResult) {
      return maybeResult;
    }

    const message = error instanceof Error ? error.message : 'docker sandbox execution failed';
    return {
      success: false,
      status: 'COMPILATION_UNAVAILABLE',
      buildLogs: '',
      errorDetails: message,
    };
  } finally {
    if ((env.MODUMAKE_SANDBOX_KEEP_WORKSPACE || '').trim().toLowerCase() !== 'true') {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }
}
