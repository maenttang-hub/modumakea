import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { buildKiCadExportSummary, buildKiCadSchematic, buildKiCadSchematicFilename } from '@/lib/export-kicad';
import { parseKiCadSExpression } from '@/lib/kicad-sym-parser';
import { setRuntimeCustomComponentPackages } from '@/lib/custom-component-registry';

test('buildKiCadSchematic exports a self-contained KiCad schematic text for a simple routed project', () => {
  const schematic = buildKiCadSchematic({
    projectName: 'greenhouse helper',
    activeBoardId: 'uno',
    components: [
      {
        instanceId: 'dht-1',
        templateId: 'tpl_dht11',
        name: '온습도 센서 1',
        value: 'DHT11',
        position: { x: 420, y: 180 },
        rotation: 0,
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
          Data: 'D2',
        },
        isFullyRouted: true,
      },
    ],
    manualConnections: [],
  });

  assert.match(schematic, /^\(kicad_sch/m);
  assert.match(schematic, /\(generator "ModuMake"\)/);
  assert.match(schematic, /\(generator_version "1\.0"\)/);
  assert.match(schematic, /\(title "greenhouse helper schematic export"\)/);
  assert.match(schematic, /\(lib_id "MCU_Module:Arduino_Uno_R3"\)/);
  assert.match(schematic, /\(lib_id "Sensor:DHT11"\)/);
  assert.match(schematic, /\(pin bidirectional line \(at [^)]+\) \(length 2\.54\)\s*\n\s+\(name "A0"/);
  assert.doesNotMatch(schematic, /\(length 2\.54\)\)\s*\n\s+\(name "/);
  assert.match(schematic, /\(property "Reference" "U1"/);
  assert.match(schematic, /\(property "Footprint" "Sensor:DHT11"/);
  assert.match(schematic, /\(hide yes\)\s*\n\s+\(show_name no\)\s*\n\s+\(do_not_autoplace no\)\s*\n\s+\(effects/);
  assert.match(schematic, /\(instances\s*\n\s+\(project "greenhouse helper"/);
  assert.doesNotMatch(schematic, /\(symbol_instances\b/);
  assert.match(schematic, /\(number "4"/);
  assert.match(schematic, /\(wire\b/);
});

test('buildKiCadSchematicFilename creates a KiCad-friendly download name', () => {
  assert.equal(
    buildKiCadSchematicFilename('Smart Farm Rev.2'),
    'Smart_Farm_Rev_2.kicad_sch'
  );
});

test('buildKiCadSchematic falls back to a generic connector symbol for unmapped custom components', () => {
  setRuntimeCustomComponentPackages([{
    version: '1.0.0',
    templateId: 'custom_probe',
    name: 'Custom Probe',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'VCC', allowedTypes: ['POWER'], preferredSide: 'left' },
      { name: 'GND', allowedTypes: ['GND'], preferredSide: 'left' },
      { name: 'SIG', allowedTypes: ['DIGITAL'], preferredSide: 'right' },
    ],
  }]);

  try {
    const schematic = buildKiCadSchematic({
      projectName: 'custom bridge',
      activeBoardId: 'uno',
      components: [
        {
          instanceId: 'probe-1',
          templateId: 'custom_probe',
          name: '커스텀 프로브 1',
          value: 'Probe',
          position: { x: 480, y: 220 },
          rotation: 0,
          assignedPins: {
            VCC: '5V',
            GND: 'GND',
            SIG: 'D2',
          },
          isFullyRouted: true,
        },
      ],
      manualConnections: [],
    });

    assert.match(schematic, /\(lib_id "Connector_Generic:Conn_01x03_Male"\)/);
    assert.match(schematic, /\(property "Reference" "J1"/);
  } finally {
    setRuntimeCustomComponentPackages([]);
  }
});

test('buildKiCadExportSummary shows standard symbols vs generic connector fallbacks before export', () => {
  setRuntimeCustomComponentPackages([{
    version: '1.0.0',
    templateId: 'custom_probe',
    name: 'Custom Probe',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'VCC', allowedTypes: ['POWER'], preferredSide: 'left' },
      { name: 'GND', allowedTypes: ['GND'], preferredSide: 'left' },
      { name: 'SIG', allowedTypes: ['DIGITAL'], preferredSide: 'right' },
    ],
  }]);

  try {
    const summary = buildKiCadExportSummary({
      activeBoardId: 'uno',
      components: [
        {
          instanceId: 'dht-1',
          templateId: 'tpl_dht11',
          name: '온습도 센서 1',
          value: 'DHT11',
          position: { x: 420, y: 180 },
          rotation: 0,
          assignedPins: { VCC: '5V', GND: 'GND', Data: 'D2' },
          isFullyRouted: true,
        },
        {
          instanceId: 'probe-1',
          templateId: 'custom_probe',
          name: '커스텀 프로브 1',
          value: 'Probe',
          position: { x: 520, y: 220 },
          rotation: 0,
          assignedPins: { VCC: '5V', GND: 'GND', SIG: 'D3' },
          isFullyRouted: true,
        },
      ],
    });

    assert.equal(summary.board.mode, 'standard-symbol');
    assert.match(summary.board.reason ?? '', /표준 보드 심볼 매핑/);
    assert.equal(summary.fallbackCount, 1);
    assert.equal(summary.standardCount, 2);
    assert.equal(summary.components.find(item => item.ownerId === 'dht-1')?.mode, 'standard-symbol');
    assert.equal(summary.components.find(item => item.ownerId === 'probe-1')?.mode, 'generic-connector-fallback');
    assert.match(
      summary.components.find(item => item.ownerId === 'probe-1')?.reason ?? '',
      /전용 심볼 매핑이 없어 3핀 범용 커넥터로 대체/
    );
  } finally {
    setRuntimeCustomComponentPackages([]);
  }
});

test('buildKiCadSchematic stays parseable for mixed mapped and fallback symbols regression case', () => {
  setRuntimeCustomComponentPackages([{
    version: '1.0.0',
    templateId: 'custom_probe',
    name: 'Custom Probe',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'VCC', allowedTypes: ['POWER'], preferredSide: 'left' },
      { name: 'GND', allowedTypes: ['GND'], preferredSide: 'left' },
      { name: 'SIG', allowedTypes: ['DIGITAL'], preferredSide: 'right' },
    ],
  }]);

  try {
    const schematic = buildKiCadSchematic({
      projectName: 'kicad regression',
      activeBoardId: 'uno',
      components: [
        {
          instanceId: 'dht-1',
          templateId: 'tpl_dht11',
          name: '온습도 센서 1',
          value: 'DHT11',
          position: { x: 420, y: 180 },
          rotation: 0,
          assignedPins: {
            VCC: '5V',
            GND: 'GND',
            Data: 'D2',
          },
          isFullyRouted: true,
        },
        {
          instanceId: 'probe-1',
          templateId: 'custom_probe',
          name: '커스텀 프로브 1',
          value: 'Probe',
          position: { x: 520, y: 220 },
          rotation: 90,
          assignedPins: {
            VCC: '5V',
            GND: 'GND',
            SIG: 'D3',
          },
          isFullyRouted: true,
        },
      ],
      manualConnections: [],
    });

    const tree = parseKiCadSExpression(schematic);
    const root = tree.find(node => Array.isArray(node)) as unknown[];

    assert.ok(root);
    assert.equal(root[0], 'kicad_sch');
    assert.match(schematic, /\(lib_id "Connector_Generic:Conn_01x03_Male"\)/);
    assert.doesNotMatch(schematic, /\bundefined\b/);
    assert.doesNotMatch(schematic, /\bNaN\b/);
    assert.match(schematic, /\(symbol "Arduino_Uno_R3_0_1"/);
    assert.match(schematic, /\(symbol "Arduino_Uno_R3_1_1"/);
  } finally {
    setRuntimeCustomComponentPackages([]);
  }
});

test('buildKiCadSchematic stays loadable by local KiCad CLI when available', { skip: !existsSync('/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli') }, () => {
  const schematic = buildKiCadSchematic({
    projectName: 'kicad cli smoke',
    activeBoardId: 'uno',
    components: [
      {
        instanceId: 'dht-1',
        templateId: 'tpl_dht11',
        name: '온습도 센서 1',
        value: 'DHT11',
        position: { x: 420, y: 180 },
        rotation: 0,
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
          Data: 'D2',
        },
        isFullyRouted: true,
      },
    ],
    manualConnections: [],
  });

  const tempDir = mkdtempSync(join(tmpdir(), 'modumake-kicad-'));
  const schematicPath = join(tempDir, 'smoke.kicad_sch');
  const netlistPath = join(tempDir, 'smoke.net');

  try {
    writeFileSync(schematicPath, schematic, 'utf8');

    const result = spawnSync(
      '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli',
      ['sch', 'export', 'netlist', schematicPath, '-o', netlistPath],
      { encoding: 'utf8' }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout || 'KiCad CLI failed to load exported schematic');
    assert.ok(existsSync(netlistPath));
    assert.match(readFileSync(netlistPath, 'utf8'), /exported_netlist|components|nets/i);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
