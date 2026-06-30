import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const { POST: pcbDrcPost } = await import('@/app/api/kicad/pcb-drc/route');

const MINIMAL_PCB_SOURCE = `(kicad_pcb
  (version 20221018)
  (generator modumake-test)
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (44 "Edge.Cuts" user)
  )
)`;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function makeFakeKiCadCli(scriptBody: string) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'modumake-fake-kicad-cli-'));
  const scriptPath = path.join(tempDir, 'kicad-cli');
  await writeFile(scriptPath, scriptBody, 'utf8');
  await chmod(scriptPath, 0o755);
  return { tempDir, scriptPath };
}

test('KiCad PCB DRC route falls back to board-only DRC when schematic parity cannot run', async () => {
  const previousCliPath = process.env.KICAD_CLI_PATH;
  const { tempDir, scriptPath } = await makeFakeKiCadCli(`#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const outputPath = args[args.indexOf('--output') + 1];
const callLog = process.env.MODUMAKE_FAKE_KICAD_CALL_LOG;
if (callLog) {
  fs.appendFileSync(callLog, args.includes('--schematic-parity') ? 'parity\\n' : 'board-only\\n');
}
if (args.includes('--schematic-parity')) {
  console.error('패리티 테스트를 위한 회로도 네트리스트를 가져오지 못함.');
  process.exit(2);
}
fs.writeFileSync(outputPath, JSON.stringify({ violations: [], unconnected_items: [] }));
`);
  const callLogPath = path.join(tempDir, 'calls.txt');
  process.env.KICAD_CLI_PATH = scriptPath;
  process.env.MODUMAKE_FAKE_KICAD_CALL_LOG = callLogPath;

  try {
    const response = await pcbDrcPost(
      new Request('http://localhost/api/kicad/pcb-drc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: MINIMAL_PCB_SOURCE, filename: '../bad name.kicad_pcb' }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.drcMode, 'board-only');
    assert.equal(Array.isArray(payload.warnings), true);
    assert.match(payload.warnings.join('\n'), /board-only|schematic parity|회로도/);
    assert.deepEqual(payload.report, { violations: [], unconnected_items: [] });
    assert.equal(await readFile(callLogPath, 'utf8'), 'parity\nboard-only\n');
  } finally {
    restoreEnv('KICAD_CLI_PATH', previousCliPath);
    delete process.env.MODUMAKE_FAKE_KICAD_CALL_LOG;
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('KiCad PCB DRC route reports schematic-parity mode when the first DRC succeeds', async () => {
  const previousCliPath = process.env.KICAD_CLI_PATH;
  const { tempDir, scriptPath } = await makeFakeKiCadCli(`#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const outputPath = args[args.indexOf('--output') + 1];
fs.writeFileSync(outputPath, JSON.stringify({
  violations: [{ type: 'clearance', severity: 'warning', description: 'test warning' }],
  unconnected_items: []
}));
`);
  process.env.KICAD_CLI_PATH = scriptPath;

  try {
    const response = await pcbDrcPost(
      new Request('http://localhost/api/kicad/pcb-drc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: MINIMAL_PCB_SOURCE, filename: 'ok.kicad_pcb' }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.drcMode, 'schematic-parity');
    assert.deepEqual(payload.warnings, []);
    assert.equal(payload.report.violations[0].type, 'clearance');
  } finally {
    restoreEnv('KICAD_CLI_PATH', previousCliPath);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('KiCad PCB DRC route rejects non-PCB source before invoking KiCad', async () => {
  const response = await pcbDrcPost(
    new Request('http://localhost/api/kicad/pcb-drc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: '(kicad_sch)' }),
    })
  );

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(payload.error, /\.kicad_pcb/);
});
