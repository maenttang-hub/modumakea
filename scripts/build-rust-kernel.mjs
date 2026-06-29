import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const rootDir = process.cwd();
const crateDir = path.join(rootDir, 'rust', 'modumake-kernel');
const outDir = path.join(rootDir, 'src', 'generated', 'modumake-kernel');

function ensureOutDir() {
  mkdirSync(outDir, { recursive: true });
}

function writeBuildInfo(status, extra = {}) {
  ensureOutDir();
  writeFileSync(
    path.join(outDir, 'build-info.json'),
    JSON.stringify(
      {
        status,
        generatedAt: new Date().toISOString(),
        ...extra,
      },
      null,
      2
    )
  );
}

function clearPreviousGeneratedArtifacts() {
  if (!existsSync(outDir)) {
    return;
  }

  for (const entry of readdirSync(outDir)) {
    if (entry === 'index.ts') {
      continue;
    }

    rmSync(path.join(outDir, entry), { recursive: true, force: true });
  }
}

if (!existsSync(crateDir)) {
  console.error('Rust kernel crate was not found at rust/modumake-kernel.');
  process.exit(1);
}

const cargoCheck = spawnSync('cargo', ['--version'], { encoding: 'utf8' });
if (cargoCheck.status !== 0) {
  console.log('Skipping Rust kernel build: cargo is not installed in this environment.');
  writeBuildInfo('skipped', { reason: 'cargo-missing' });
  process.exit(0);
}

const wasmPackCheck = spawnSync('wasm-pack', ['--version'], { encoding: 'utf8' });
if (wasmPackCheck.status !== 0) {
  console.log('Skipping Rust kernel build: wasm-pack is not installed in this environment.');
  writeBuildInfo('skipped', { reason: 'wasm-pack-missing' });
  process.exit(0);
}

ensureOutDir();
clearPreviousGeneratedArtifacts();
const result = spawnSync(
  'wasm-pack',
  [
    'build',
    crateDir,
    '--target',
    'web',
    '--out-dir',
    outDir,
    '--out-name',
    'modumake_kernel',
  ],
  {
    stdio: 'inherit',
  }
);

if (result.status === 0) {
  writeBuildInfo('built', {
    crateDir: path.relative(rootDir, crateDir),
    outDir: path.relative(rootDir, outDir),
    target: 'web',
    outName: 'modumake_kernel',
  });
} else {
  writeBuildInfo('failed', {
    crateDir: path.relative(rootDir, crateDir),
    outDir: path.relative(rootDir, outDir),
    exitCode: result.status ?? 1,
  });
}

process.exit(result.status ?? 1);
