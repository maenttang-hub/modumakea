import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const MAX_SOURCE_CODE_LENGTH = Number(process.env.MODUMAKE_COMPILE_SOURCE_LIMIT || 30000);
const SAFE_LIBRARY_NAME_REGEX = /^[A-Za-z0-9 _.+\-()]+$/;

function trimLine(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeRequiredLibraries(requiredLibraries) {
  if (!Array.isArray(requiredLibraries)) {
    return [];
  }

  const unique = new Set();
  for (const libraryName of requiredLibraries) {
    const normalized = trimLine(libraryName);
    if (!normalized) {
      continue;
    }
    if (!SAFE_LIBRARY_NAME_REGEX.test(normalized)) {
      throw new Error(`허용되지 않는 라이브러리 이름입니다: ${normalized}`);
    }
    unique.add(normalized);
  }

  return Array.from(unique);
}

function validateCallback(callback) {
  if (!callback || typeof callback !== 'object') {
    throw new Error('resultCallback이 필요합니다.');
  }

  const url = trimLine(callback.url);
  const token = trimLine(callback.token);
  if (!url) {
    throw new Error('resultCallback.url이 필요합니다.');
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('resultCallback.url 형식이 올바르지 않습니다.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('resultCallback.url은 http 또는 https 여야 합니다.');
  }
  if (!token) {
    throw new Error('resultCallback.token이 필요합니다.');
  }

  return { url, token };
}

export function validateSandboxLaunchRequest(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('샌드박스 런치 요청 본문이 비어 있습니다.');
  }

  const launchRequestId = trimLine(payload.launchRequestId);
  const queueJobId = trimLine(payload.queueJobId);
  const requestId = trimLine(payload.requestId);
  const ownerKey = trimLine(payload.ownerKey);
  const boardId = trimLine(payload.boardId);
  const requiredLibraries = sanitizeRequiredLibraries(payload.requiredLibraries);
  const sourceCodeHash = trimLine(payload.sourceCodeHash);
  const sourceCodeLength = Number(payload.sourceCodeLength || 0);
  const resultCallback = validateCallback(payload.resultCallback);
  const runtimePayload = payload.payload;

  if (!launchRequestId) {
    throw new Error('launchRequestId가 필요합니다.');
  }
  if (!queueJobId) {
    throw new Error('queueJobId가 필요합니다.');
  }
  if (!requestId) {
    throw new Error('requestId가 필요합니다.');
  }
  if (!ownerKey) {
    throw new Error('ownerKey가 필요합니다.');
  }
  if (!boardId) {
    throw new Error('boardId가 필요합니다.');
  }
  if (!sourceCodeHash) {
    throw new Error('sourceCodeHash가 필요합니다.');
  }
  if (!Number.isFinite(sourceCodeLength) || sourceCodeLength <= 0) {
    throw new Error('sourceCodeLength가 올바르지 않습니다.');
  }
  if (!runtimePayload || typeof runtimePayload !== 'object') {
    throw new Error('payload가 필요합니다.');
  }
  if (trimLine(runtimePayload.boardId) !== boardId) {
    throw new Error('payload.boardId와 boardId가 일치해야 합니다.');
  }
  if (typeof runtimePayload.sourceCode !== 'string' || !runtimePayload.sourceCode.trim()) {
    throw new Error('payload.sourceCode가 비어 있습니다.');
  }
  if (runtimePayload.sourceCode.length > MAX_SOURCE_CODE_LENGTH) {
    throw new Error(`payload.sourceCode가 너무 깁니다. (${MAX_SOURCE_CODE_LENGTH}자 이하)`);
  }

  return {
    launchRequestId,
    queueJobId,
    requestId,
    ownerKey,
    boardId,
    requiredLibraries,
    sourceCodeHash,
    sourceCodeLength,
    resultCallback,
    payload: {
      jobId: trimLine(runtimePayload.jobId) || launchRequestId,
      boardId,
      sourceCode: runtimePayload.sourceCode,
      requiredLibraries,
    },
  };
}

export function buildOneShotRuntimeSpec(payload, env = process.env) {
  const launcherJobId = randomUUID();
  const createdAt = nowIso();
  const workspaceRoot = env.MODUMAKE_SANDBOX_WORKSPACE_ROOT?.trim() || '/tmp/modumake-sandbox-workspace';

  return {
    launcherJobId,
    createdAt,
    runtimeKind: 'one-shot-sandbox',
    launchRequestId: payload.launchRequestId,
    queueJobId: payload.queueJobId,
    requestId: payload.requestId,
    ownerKey: payload.ownerKey,
    payload: payload.payload,
    dependencyManifest: {
      boardId: payload.boardId,
      requiredLibraries: payload.requiredLibraries,
      sourceCodeHash: payload.sourceCodeHash,
      sourceCodeLength: payload.sourceCodeLength,
    },
    callback: payload.resultCallback,
    runtimeSpec: {
      backend: env.MODUMAKE_SANDBOX_RUNTIME_BACKEND?.trim() || 'docker-cli-one-shot',
      imageRef:
        env.MODUMAKE_SANDBOX_RUNTIME_IMAGE?.trim() ||
        'modumake/compile-sandbox-runtime:local',
      nonRootUser: env.MODUMAKE_SANDBOX_RUNTIME_USER?.trim() || 'sandbox',
      workspace: {
        root: path.join(workspaceRoot, launcherJobId),
        mode: 'tmpfs',
        readOnlyRootFs: true,
      },
      security: {
        dropCapabilities: ['ALL'],
        privileged: false,
        hostMounts: [],
        seccompProfile: env.MODUMAKE_SANDBOX_SECCOMP_PROFILE?.trim() || 'default',
        appArmorProfile: env.MODUMAKE_SANDBOX_APPARMOR_PROFILE?.trim() || 'default',
      },
      resources: {
        cpuLimit: env.MODUMAKE_SANDBOX_CPU_LIMIT?.trim() || '1',
        memoryLimitMb: Number(env.MODUMAKE_SANDBOX_MEMORY_LIMIT_MB || 512),
        pidsLimit: Number(env.MODUMAKE_SANDBOX_PIDS_LIMIT || 128),
        diskLimitMb: Number(env.MODUMAKE_SANDBOX_DISK_LIMIT_MB || 256),
        wallClockTimeoutMs: Number(env.MODUMAKE_SANDBOX_TIMEOUT_MS || 20000),
      },
      networkPolicy: {
        compilePhase: 'disabled',
        dependencyInstallPhase:
          env.MODUMAKE_SANDBOX_DEP_INSTALL_NETWORK?.trim() || 'allowlist-only',
      },
      artifactPolicy: {
        resultCallbackUrl: payload.resultCallback.url,
        allowArtifactKinds: ['hex'],
      },
    },
  };
}

function getLaunchQueueFilePath(env = process.env) {
  const configured = env.MODUMAKE_SANDBOX_LAUNCH_QUEUE_FILE?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }

  return path.join(process.cwd(), '.modumake', 'sandbox-launch-queue.json');
}

async function readLaunchQueue(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.jobs) ? parsed.jobs : [];
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeLaunchQueue(filePath, jobs) {
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify({ version: 1, jobs }, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

export async function enqueueSandboxLaunchJob(runtimeSpec, env = process.env) {
  const filePath = getLaunchQueueFilePath(env);
  const jobs = await readLaunchQueue(filePath);
  jobs.push({
    ...runtimeSpec,
    state: 'queued',
    claimedAt: null,
    submittedAt: null,
    completedAt: null,
    errorDetails: null,
  });
  await writeLaunchQueue(filePath, jobs);
  return {
    launcherJobId: runtimeSpec.launcherJobId,
    queueFile: filePath,
    queuedJobs: jobs.length,
  };
}

export async function claimNextSandboxLaunchJob(env = process.env) {
  const filePath = getLaunchQueueFilePath(env);
  const jobs = await readLaunchQueue(filePath);
  const nextIndex = jobs
    .map((job, index) => ({ job, index }))
    .filter(({ job }) => job.state === 'queued')
    .sort((left, right) => left.job.createdAt.localeCompare(right.job.createdAt))[0]?.index;

  if (nextIndex === undefined) {
    return null;
  }

  const claimedAt = nowIso();
  jobs[nextIndex] = {
    ...jobs[nextIndex],
    state: 'claimed',
    claimedAt: jobs[nextIndex].claimedAt || claimedAt,
  };
  await writeLaunchQueue(filePath, jobs);
  return jobs[nextIndex];
}

export async function updateSandboxLaunchJobState(
  launcherJobId,
  patch,
  env = process.env
) {
  const filePath = getLaunchQueueFilePath(env);
  const jobs = await readLaunchQueue(filePath);
  const jobIndex = jobs.findIndex(candidate => candidate.launcherJobId === launcherJobId);
  if (jobIndex < 0) {
    return null;
  }

  const current = jobs[jobIndex];
  const nextState = patch.state;
  const now = nowIso();
  jobs[jobIndex] = {
    ...current,
    state: nextState,
    errorDetails: patch.errorDetails ?? current.errorDetails ?? null,
    submittedAt:
      nextState === 'submitted'
        ? current.submittedAt || now
        : current.submittedAt,
    completedAt:
      nextState === 'succeeded' || nextState === 'failed'
        ? now
        : current.completedAt,
  };
  await writeLaunchQueue(filePath, jobs);
  return jobs[jobIndex];
}

export async function inspectSandboxLauncherRuntime(env = process.env) {
  return {
    ok: true,
    runtimeBackend: env.MODUMAKE_SANDBOX_RUNTIME_BACKEND?.trim() || 'docker-cli-one-shot',
    launchQueueFile: getLaunchQueueFilePath(env),
    runtimeImage:
      env.MODUMAKE_SANDBOX_RUNTIME_IMAGE?.trim() ||
      'modumake/compile-sandbox-runtime:local',
    tmpDir: os.tmpdir(),
  };
}
