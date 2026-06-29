import { cp, mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compileJobWithPolicy } from '../compile-server/lib/compiler.mjs';

function readArg(index, label) {
  const value = process.argv[index];
  if (!value) {
    throw new Error(`${label} argument is required.`);
  }
  return value;
}

async function ensureArduinoDataDir() {
  const runtimeDataDir = process.env.ARDUINO_DIRECTORIES_DATA?.trim() || '/tmp/.arduino15';
  const bakedDataDir = '/opt/arduino-data';
  try {
    await stat(path.join(runtimeDataDir, 'package_index.json'));
    return;
  } catch {
    // bootstrap from image-baked data
  }

  await mkdir(runtimeDataDir, { recursive: true });

  for (const filename of [
    'arduino-cli.yaml',
    'package_index.json',
    'package_index.json.sig',
    'library_index.json',
    'library_index.json.sig',
    'inventory.yaml',
  ]) {
    try {
      await cp(path.join(bakedDataDir, filename), path.join(runtimeDataDir, filename));
    } catch {
      // optional metadata file
    }
  }

  for (const directoryName of ['packages', 'libraries']) {
    try {
      await symlink(path.join(bakedDataDir, directoryName), path.join(runtimeDataDir, directoryName));
    } catch {
      // already exists or optional directory
    }
  }
}

async function main() {
  const inputPath = readArg(2, 'inputPath');
  const outputPath = readArg(3, 'outputPath');
  const raw = await readFile(inputPath, 'utf8');
  const payload = JSON.parse(raw);

  await ensureArduinoDataDir();

  const result = await compileJobWithPolicy(payload, {
    libraryInstallMode:
      process.env.MODUMAKE_COMPILE_LIBRARY_INSTALL_MODE?.trim().toLowerCase() ||
      'preinstalled-only',
    allowedLibraries: process.env.MODUMAKE_PREBAKED_LIBRARY_ALLOWLIST,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

main().catch(async error => {
  const outputPath = process.argv[3];
  const payload = {
    success: false,
    status: 'COMPILATION_UNAVAILABLE',
    buildLogs: '',
    errorDetails: error instanceof Error ? error.message : 'sandbox runtime execution failed',
  };

  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
  process.exitCode = 1;
});
