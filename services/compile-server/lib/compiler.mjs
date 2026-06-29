import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveFqbnForBoard } from './fqbn-map.mjs';

const execFileAsync = promisify(execFile);
const SAFE_LIBRARY_NAME_REGEX = /^[A-Za-z0-9 _.+\-()]+$/;
const SAFE_JOB_ID_REGEX = /^[A-Za-z0-9_-]+$/;
const DEFAULT_TIMEOUT_MS = Number(process.env.MODUMAKE_COMPILE_TIMEOUT_MS || 15000);
const ARDUINO_CLI_BIN = process.env.ARDUINO_CLI_BIN || 'arduino-cli';
const MAX_SOURCE_CODE_LENGTH = Number(process.env.MODUMAKE_COMPILE_SOURCE_LIMIT || 30000);
const DEFAULT_LIBRARY_INSTALL_MODE =
  process.env.MODUMAKE_COMPILE_LIBRARY_INSTALL_MODE?.trim().toLowerCase() || 'install';

function trimLine(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeJobId(jobId) {
  return trimLine(jobId).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function sanitizeRequiredLibraries(requiredLibraries) {
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

export function validateCompileJobRequest(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('컴파일 요청 본문이 비어 있습니다.');
  }

  const jobId = normalizeJobId(payload.jobId);
  const boardId = trimLine(payload.boardId);
  const sourceCode = typeof payload.sourceCode === 'string' ? payload.sourceCode : '';
  const requiredLibraries = sanitizeRequiredLibraries(payload.requiredLibraries);

  if (!jobId) {
    throw new Error('jobId가 필요합니다.');
  }
  if (!SAFE_JOB_ID_REGEX.test(jobId)) {
    throw new Error('jobId에는 영문, 숫자, 밑줄(_), 하이픈(-)만 사용할 수 있습니다.');
  }
  if (!boardId) {
    throw new Error('boardId가 필요합니다.');
  }
  if (!sourceCode.trim()) {
    throw new Error('sourceCode가 비어 있습니다.');
  }
  if (sourceCode.length > MAX_SOURCE_CODE_LENGTH) {
    throw new Error(`sourceCode가 너무 깁니다. (${MAX_SOURCE_CODE_LENGTH}자 이하)`);
  }

  const fqbn = resolveFqbnForBoard(boardId);
  if (!fqbn) {
    throw new Error(`지원되지 않는 boardId입니다: ${boardId}`);
  }

  return {
    jobId,
    boardId,
    fqbn,
    sourceCode,
    requiredLibraries,
  };
}

function readAllowedLibrarySet(rawAllowedLibraries) {
  if (Array.isArray(rawAllowedLibraries)) {
    return new Set(sanitizeRequiredLibraries(rawAllowedLibraries));
  }

  const normalized = trimLine(rawAllowedLibraries);
  if (!normalized) {
    return new Set();
  }

  return new Set(
    normalized
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean)
      .flatMap(entry => sanitizeRequiredLibraries([entry]))
  );
}

async function runArduinoCli(args) {
  try {
    const result = await execFileAsync(ARDUINO_CLI_BIN, args, {
      timeout: DEFAULT_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      ok: true,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    const message = error instanceof Error ? error.message : 'arduino-cli 실행 실패';
    return {
      ok: false,
      stdout,
      stderr,
      message,
    };
  }
}

export async function inspectCompilerRuntime() {
  const versionResult = await runArduinoCli(['version']);
  const coreListResult = await runArduinoCli(['core', 'list']);

  return {
    ok: versionResult.ok,
    cliBin: ARDUINO_CLI_BIN,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    version: versionResult.stdout.trim() || versionResult.stderr.trim() || null,
    installedCores: coreListResult.stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean),
  };
}

async function installLibraries(requiredLibraries) {
  const logs = [];

  for (const libraryName of requiredLibraries) {
    const result = await runArduinoCli(['lib', 'install', libraryName]);
    logs.push(`$ arduino-cli lib install "${libraryName}"`);
    if (result.stdout) {
      logs.push(result.stdout.trim());
    }
    if (result.stderr) {
      logs.push(result.stderr.trim());
    }
    if (!result.ok) {
      throw new Error(`라이브러리 설치 실패: ${libraryName}\n${logs.filter(Boolean).join('\n')}`);
    }
  }

  return logs.filter(Boolean).join('\n');
}

function resolveLibraryPolicy(options = {}) {
  const libraryInstallMode =
    options.libraryInstallMode?.trim().toLowerCase() || DEFAULT_LIBRARY_INSTALL_MODE;
  return {
    libraryInstallMode:
      libraryInstallMode === 'preinstalled-only' ? 'preinstalled-only' : 'install',
    allowedLibraries: readAllowedLibrarySet(options.allowedLibraries),
  };
}

async function applyLibraryPolicy(requiredLibraries, options = {}) {
  const policy = resolveLibraryPolicy(options);
  if (policy.libraryInstallMode === 'install') {
    return await installLibraries(requiredLibraries);
  }

  const rejectedLibraries = requiredLibraries.filter(
    libraryName => !policy.allowedLibraries.has(libraryName)
  );

  if (rejectedLibraries.length > 0) {
    throw new Error(
      `prebaked allowlist에 없는 라이브러리입니다: ${rejectedLibraries.join(', ')}`
    );
  }

  if (requiredLibraries.length === 0) {
    return 'Using prebaked runtime image with no external library install.';
  }

  return `Using prebaked runtime libraries: ${requiredLibraries.join(', ')}`;
}

async function readHexOutput(outputDir) {
  try {
    const candidateFiles = [
      'sketch.ino.hex',
      'sketch.ino.with_bootloader.hex',
      'firmware.hex',
    ];

    for (const candidate of candidateFiles) {
      const filePath = path.join(outputDir, candidate);
      try {
        const content = await readFile(filePath);
        return content.toString('base64');
      } catch {
        // keep scanning
      }
    }
  } catch {
    // ignore optional artifact lookup
  }

  return undefined;
}

export async function compileJobWithPolicy(rawPayload, options = {}) {
  const payload = validateCompileJobRequest(rawPayload);
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'modumake-build-'));
  const sketchDir = path.join(workspaceRoot, payload.jobId);
  const outputDir = path.join(sketchDir, 'build');
  const sketchFileName = `${payload.jobId}.ino`;
  const sketchPath = path.join(sketchDir, sketchFileName);

  try {
    await mkdir(sketchDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await writeFile(sketchPath, payload.sourceCode, 'utf8');

    const installLogs = await applyLibraryPolicy(payload.requiredLibraries, options);
    const compileResult = await runArduinoCli([
      'compile',
      '--fqbn',
      payload.fqbn,
      '--output-dir',
      outputDir,
      sketchDir,
    ]);

    const buildLogs = [
      installLogs,
      `$ arduino-cli compile --fqbn ${payload.fqbn} --output-dir ${outputDir} ${sketchDir}`,
      compileResult.stdout?.trim(),
      compileResult.stderr?.trim(),
    ]
      .filter(Boolean)
      .join('\n');

    if (!compileResult.ok) {
      return {
        success: false,
        status: 'COMPILATION_ERROR',
        buildLogs,
        errorDetails: compileResult.message,
      };
    }

    return {
      success: true,
      status: 'COMPILATION_SUCCESS',
      buildLogs,
      hexBinary: await readHexOutput(outputDir),
    };
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

export async function compileJob(rawPayload) {
  return compileJobWithPolicy(rawPayload);
}
