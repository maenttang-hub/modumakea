import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLightweightValidationJson,
  mergeLightweightValidationJsonReviewContext,
} from '@/lib/build-lightweight-validation-json';
import { buildImportedSchematicIntegratedValidationJson } from '@/lib/build-imported-schematic-integrated-validation-json';
import { buildKiCadSchematic } from '@/lib/export-kicad';
import { importKiCadSchematic } from '@/lib/kicad-sch-parser';
import { parseKiCadSchematicToLightweightValidationJson } from '@/lib/parse-kicad-for-validation';
import { resolveValidationAiInput } from '@/lib/resolve-validation-ai-input';
import type { ProjectAuditIssue } from '@/types';

const auditIssues: ProjectAuditIssue[] = [
  {
    severity: 'warning',
    title: 'I2C Pull-up Missing',
    message: 'SDA/SCL lines need explicit pull-up resistors.',
    recommendation: 'Add 4.7kΩ pull-up resistors.',
    ruleId: 'i2c.pullup-missing',
    componentName: 'U1',
  },
];

test('buildLightweightValidationJson keeps review facts in the lightweight AI contract', () => {
  const schematic = buildKiCadSchematic({
    projectName: 'Imported Review Sample',
    activeBoardId: 'uno',
    components: [
      {
        instanceId: 'dht-1',
        templateId: 'tpl_dht11',
        name: 'DHT11',
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

  const imported = importKiCadSchematic(schematic, { projectName: 'Imported Review Sample' });
  const payload = buildLightweightValidationJson({
    document: imported.document,
    importSummary: imported.summary,
    auditIssues,
    sourceCode: 'void setup() { pinMode(D2, INPUT); }',
  });

  assert.equal(payload.schema_version, '2026-06-19');
  assert.equal(payload.source.project_name, 'Imported Review Sample');
  assert.equal(payload.components.length, 1);
  assert.equal(payload.components[0]?.ref, 'U1');
  assert.equal(payload.components[0]?.pins[0]?.pin_number.length > 0, true);
  assert.equal(payload.stats.net_count, payload.nets.length);
  assert.equal(payload.stats.component_count, 1);
  assert.equal(payload.stats.ignored_non_electrical_symbol_count, 0);
  assert.equal(payload.stats.non_component_marker_count, 0);
  assert.deepEqual(payload.unresolved.ignored_non_electrical_symbols, []);
  assert.deepEqual(payload.unresolved.non_component_markers, []);
  assert.equal(payload.validation_flags?.length, 1);
  assert.equal(payload.rule_findings?.length, 1);
  assert.equal(payload.code_pin_usage?.length, 1);
  assert.equal(payload.code_pin_usage?.[0]?.pinArgument, 'D2');
  assert.equal(payload.code_pin_usage?.[0]?.matchedMcuPinLabel ?? null, null);
});

test('mergeLightweightValidationJsonReviewContext keeps v3 structure while layering review facts', () => {
  const schematic = buildKiCadSchematic({
    projectName: 'Direct V3 Payload',
    activeBoardId: 'uno',
    components: [
      {
        instanceId: 'led-1',
        templateId: 'tpl_led',
        name: 'LED',
        value: 'LED',
        position: { x: 200, y: 120 },
        rotation: 0,
        assignedPins: {
          Anode: 'D2',
          Cathode: 'GND',
        },
        isFullyRouted: true,
      },
    ],
    manualConnections: [],
  });

  const imported = importKiCadSchematic(schematic, { projectName: 'Direct V3 Payload' });
  const sharedPayload = buildLightweightValidationJson({
    document: imported.document,
    importSummary: imported.summary,
    auditIssues,
    sourceCode: 'void setup() { pinMode(D2, OUTPUT); }',
  });
  const directPayload = parseKiCadSchematicToLightweightValidationJson(imported.document.importedSchematicSource ?? schematic, {
    projectName: imported.document.projectName,
  });
  const merged = mergeLightweightValidationJsonReviewContext(directPayload, {
    code_pin_usage: sharedPayload.code_pin_usage,
    validation_flags: sharedPayload.validation_flags,
    rule_findings: sharedPayload.rule_findings,
  });

  assert.equal(merged.components.length, directPayload.components.length);
  assert.equal(merged.nets.length, directPayload.nets.length);
  assert.equal(merged.stats.wire_segment_count, directPayload.stats.wire_segment_count);
  assert.equal(merged.validation_flags?.length, sharedPayload.validation_flags?.length);
  assert.equal(merged.rule_findings?.length, sharedPayload.rule_findings?.length);
  assert.equal(merged.code_pin_usage?.[0]?.pinArgument, 'D2');
});

test('buildImportedSchematicIntegratedValidationJson preserves a reusable v3 validation snapshot for imported schematics', () => {
  const schematic = buildKiCadSchematic({
    projectName: 'Integrated snapshot',
    activeBoardId: 'uno',
    components: [
      {
        instanceId: 'display-1',
        templateId: 'tpl_lcd_1602_i2c',
        name: 'LCD 1602',
        value: 'LCD 1602',
        position: { x: 260, y: 120 },
        rotation: 0,
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
          SDA: 'A4',
          SCL: 'A5',
        },
        isFullyRouted: true,
      },
    ],
    manualConnections: [],
  });

  const imported = importKiCadSchematic(schematic, { projectName: 'Integrated snapshot' });
  const integrated = buildImportedSchematicIntegratedValidationJson({
    document: imported.document,
    importedSource: schematic,
    importSummary: imported.summary,
  });

  assert.ok(integrated);
  assert.equal(integrated?.schemaVersion, '2026-06-19');
  assert.equal(integrated?.project.projectName, 'Integrated snapshot');
  assert.equal(integrated?.project.importedComponentCount, imported.summary.importedComponentCount);
  assert.equal(integrated?.components.length, 1);
  assert.equal(integrated?.nets.length >= 1, true);
});

test('resolveValidationAiInput uses the legacy integrated snapshot only when imported source is missing', () => {
  const schematic = buildKiCadSchematic({
    projectName: 'Persisted AI input',
    activeBoardId: 'uno',
    components: [
      {
        instanceId: 'led-1',
        templateId: 'tpl_led',
        name: 'LED',
        value: 'LED',
        position: { x: 180, y: 140 },
        rotation: 0,
        assignedPins: {
          Anode: 'D2',
          Cathode: 'GND',
        },
        isFullyRouted: true,
      },
    ],
    manualConnections: [],
  });

  const imported = importKiCadSchematic(schematic, { projectName: 'Persisted AI input' });
  const integratedValidationJson = buildImportedSchematicIntegratedValidationJson({
    document: imported.document,
    importedSource: schematic,
    importSummary: imported.summary,
  });

  assert.ok(integratedValidationJson);

  const legacyOnlyDocument = {
    ...imported.document,
    importedSchematicSource: null,
    integratedValidationJson: integratedValidationJson ?? null,
  };

  const resolved = resolveValidationAiInput({
    document: legacyOnlyDocument,
    auditIssues,
    sourceCode: 'void setup() { pinMode(D2, OUTPUT); }',
  });

  assert.equal(resolved.schema_version, '2026-06-19');
  assert.equal(resolved.source.project_name, 'Persisted AI input');
  assert.equal(resolved.components.length, integratedValidationJson?.components.length);
  assert.equal(resolved.nets.length, integratedValidationJson?.nets.length);
  assert.equal(resolved.validation_flags?.length, 1);
  assert.equal(resolved.rule_findings?.length, 1);
  assert.equal(resolved.code_pin_usage?.[0]?.pinArgument, 'D2');
});

test('resolveValidationAiInput keeps the v3 source path canonical even when an integrated snapshot is also present', () => {
  const schematic = buildKiCadSchematic({
    projectName: 'Canonical source wins',
    activeBoardId: 'uno',
    components: [
      {
        instanceId: 'sensor-1',
        templateId: 'tpl_dht22',
        name: 'DHT22',
        value: 'DHT22',
        position: { x: 220, y: 140 },
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

  const imported = importKiCadSchematic(schematic, { projectName: 'Canonical source wins' });
  const integratedValidationJson = buildImportedSchematicIntegratedValidationJson({
    document: imported.document,
    importedSource: schematic,
    importSummary: imported.summary,
  });

  assert.ok(integratedValidationJson);
  if (integratedValidationJson) {
    integratedValidationJson.project.projectName = 'Legacy snapshot name';
    integratedValidationJson.components = [];
    integratedValidationJson.nets = [];
  }

  const resolved = resolveValidationAiInput({
    document: {
      ...imported.document,
      integratedValidationJson: integratedValidationJson ?? null,
    },
    auditIssues,
    sourceCode: 'void setup() { pinMode(D2, INPUT); }',
  });

  assert.equal(resolved.source.project_name, 'Canonical source wins');
  assert.equal(resolved.components.length > 0, true);
  assert.equal(resolved.nets.length > 0, true);
  assert.equal(resolved.validation_flags?.length, 1);
  assert.equal(resolved.code_pin_usage?.[0]?.pinArgument, 'D2');
});

test('resolveValidationAiInput reparses importedSchematicSource through the v3 path when no persisted snapshot exists', () => {
  const schematic = buildKiCadSchematic({
    projectName: 'Direct source fallback',
    activeBoardId: 'uno',
    components: [
      {
        instanceId: 'sensor-1',
        templateId: 'tpl_dht22',
        name: 'DHT22',
        value: 'DHT22',
        position: { x: 200, y: 140 },
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

  const imported = importKiCadSchematic(schematic, { projectName: 'Direct source fallback' });
  const resolved = resolveValidationAiInput({
    document: {
      ...imported.document,
      integratedValidationJson: null,
    },
    auditIssues,
    sourceCode: 'void setup() { pinMode(D2, INPUT); }',
  });

  assert.equal(resolved.schema_version, '2026-06-19');
  assert.equal(resolved.source.project_name, 'Direct source fallback');
  assert.equal(resolved.components.length > 0, true);
  assert.equal(resolved.nets.length > 0, true);
  assert.equal(resolved.code_pin_usage?.[0]?.pinArgument, 'D2');
  assert.equal(resolved.validation_flags?.length, 1);
});
