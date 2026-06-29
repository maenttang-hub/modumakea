import test from 'node:test';
import assert from 'node:assert/strict';

import { buildKiCadSchematic } from '@/lib/export-kicad';
import { buildDatasheetReviewPayload } from '@/lib/build-datasheet-review-payload';
import { importKiCadSchematic } from '@/lib/kicad-sch-parser';
import { buildImportedSchematicAuditIssues } from '@/lib/imported-schematic-audit';
import { makeTemplate } from './test-fixtures.ts';

function replaceWireSection(schematic: string, wireSection: string) {
  return schematic.replace(
    /\n  \(wire[\s\S]*?\n  \(sheet_instances/,
    `\n${wireSection}\n  (sheet_instances`
  );
}

test('buildDatasheetReviewPayload keeps imported KiCad DHT symbols in a structured review payload', () => {
  const exported = buildKiCadSchematic({
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

  const schematic = replaceWireSection(exported, [
    '  (wire',
    '    (pts (xy 9 49.14) (xy 77.04 34.2))',
    '    (stroke (width 0) (type default))',
    '    (uuid "wire-vcc")',
    '  )',
    '  (wire',
    '    (pts (xy 9 55.8) (xy 77.04 38.7))',
    '    (stroke (width 0) (type default))',
    '    (uuid "wire-gnd")',
    '  )',
    '  (wire',
    '    (pts (xy 37.8 29.16) (xy 77.04 43.2))',
    '    (stroke (width 0) (type default))',
    '    (uuid "wire-data")',
    '  )',
  ].join('\n'));

  const imported = importKiCadSchematic(schematic, { projectName: 'greenhouse helper' });
  const payload = buildDatasheetReviewPayload({
    document: imported.document,
    importSummary: imported.summary,
    auditIssues: [],
  });

  assert.equal(payload.project.projectName, 'greenhouse helper');
  assert.equal(payload.project.boardId, 'uno');
  assert.equal(payload.project.sourceKind, 'kicad_import');
  assert.equal(payload.components.length, 1);
  assert.equal(payload.ruleFindings.length, 0);
  assert.equal(payload.components[0]?.reference, 'U1');
  assert.ok(payload.components[0]?.value);
  assert.deepEqual(
    payload.components[0]?.pins.map(pin => pin.pinName).sort(),
    ['Data', 'GND', 'VCC']
  );
  assert.ok(Array.isArray(payload.nets));
  assert.ok(payload.extractionPlan.targets.some(target => target.displayName.includes('온습도')));
});

test('buildDatasheetReviewPayload keeps imported generic symbols and imported audit issues in the review contract', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "MCU_Microchip_ATmega:ATmega328P-PU"
      (property "Reference" "U" (id 0) (at 0 0 0))
      (property "Value" "ATmega328P-PU" (id 1) (at 0 -2.54 0))
      (symbol "ATmega328P-PU_1_1"
        (pin input line (at -5.08 0 0) (length 2.54)
          (name "PB0" (effects (font (size 1.27 1.27))))
          (number "14" (effects (font (size 1.27 1.27))))
        )
        (pin power_in line (at -5.08 2.54 0) (length 2.54)
          (name "VCC" (effects (font (size 1.27 1.27))))
          (number "7" (effects (font (size 1.27 1.27))))
        )
        (pin power_in line (at -5.08 5.08 0) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "8" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "MCU_Microchip_ATmega:ATmega328P-PU")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "mcu-1")
    (property "Reference" "U1" (id 0) (at 50.8 45.72 0))
    (property "Value" "ATmega328P-PU" (id 1) (at 50.8 55.88 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const imported = importKiCadSchematic(schematic, { projectName: 'custom mcu' });
  const fallbackTemplate = makeTemplate({
    id: imported.document.components[0]!.templateId,
    name: 'ATmega328P-PU',
    category: 'COMMUNICATION',
    pins: [
      { name: 'PB0', allowedTypes: ['DIGITAL'] },
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
    ],
  });

  const auditIssues = buildImportedSchematicAuditIssues({
    components: imported.document.components,
    resolveTemplate(templateId: string) {
      if (templateId === fallbackTemplate.id) {
        return fallbackTemplate;
      }
      return imported.document.templateCache?.[templateId];
    },
    manualConnections: imported.document.manualConnections,
  });

  const payload = buildDatasheetReviewPayload({
    document: imported.document,
    importSummary: imported.summary,
    auditIssues,
  });

  assert.equal(payload.project.boardId, 'kicad_generic');
  assert.equal(payload.project.sourceKind, 'kicad_import');
  assert.equal(payload.project.importedAsGenericBoard, true);
  assert.equal(payload.components[0]?.sourceKind, 'imported_symbol');
  assert.ok(payload.components[0]?.mpnCandidates.includes('ATmega328P-PU'));
  assert.ok(payload.ruleFindings.some(issue => issue.ruleId === 'imported.power-pin-unconnected'));
  assert.ok(payload.ruleFindings.some(issue => issue.ruleId === 'imported.ground-pin-unconnected'));
  assert.ok(payload.ruleFindings.some(issue => issue.sourceBucket === 'generic' || issue.sourceBucket === 'fallback'));
  assert.ok(payload.extractionPlan.targets[0]?.requestedSections.includes('power-supply'));
  assert.ok(payload.extractionPlan.targets[0]?.searchQueries.some(query => query.includes('datasheet pdf')));
});

test('buildDatasheetReviewPayload includes code pin usage and merges rule-based/formal validation flags', () => {
  const exported = buildKiCadSchematic({
    projectName: 'logic cross-check',
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

  const schematic = replaceWireSection(exported, [
    '  (wire',
    '    (pts (xy 9 49.14) (xy 77.04 34.2))',
    '    (stroke (width 0) (type default))',
    '    (uuid "wire-vcc")',
    '  )',
    '  (wire',
    '    (pts (xy 9 55.8) (xy 77.04 38.7))',
    '    (stroke (width 0) (type default))',
    '    (uuid "wire-gnd")',
    '  )',
    '  (wire',
    '    (pts (xy 37.8 29.16) (xy 77.04 43.2))',
    '    (stroke (width 0) (type default))',
    '    (uuid "wire-data")',
    '  )',
  ].join('\n'));

  const imported = importKiCadSchematic(schematic, { projectName: 'logic cross-check' });
  const payload = buildDatasheetReviewPayload({
    document: imported.document,
    importSummary: imported.summary,
    sourceCode: `
      void setup() {
        pinMode(D2, INPUT);
        digitalWrite(D6, HIGH);
      }
    `,
    auditIssues: [
      {
        severity: 'warning',
        title: 'I2C Pull-up Missing',
        message: 'SCL/SDA pull-up is missing.',
        code: 'audit.i2c-pullup-missing',
        ruleId: 'audit.i2c-pullup-missing',
        recommendation: 'Add 4.7k pull-up resistors.',
      },
    ],
    formalReport: {
      analyzed: true,
      operationCount: 2,
      issueCount: 1,
      issues: [
        {
          severity: 'error',
          title: 'Logic Drive Conflict',
          message: 'Code drives a grounded pin.',
          code: 'formal.output-drive-grounded-net',
          ruleId: 'formal.output-drive-grounded-net',
          boardPin: 'D2',
          line: 3,
          operation: 'digitalWrite',
          recommendation: 'Move the signal to another GPIO.',
        },
      ],
    },
  });

  assert.equal(payload.codePinUsage.length, 2);
  assert.equal(payload.codePinUsage[0]?.pinArgument, 'D2');
  assert.equal(payload.codePinUsage[0]?.matchedMcuPinLabel, 'D2');
  assert.ok(payload.codePinUsage[0]?.connectedComponentReferences.includes('U1'));
  assert.equal(payload.codePinUsage[1]?.pinArgument, 'D6');
  assert.equal(payload.codePinUsage[1]?.matchedMcuPinLabel, null);

  assert.equal(payload.validationFlags.length, 2);
  assert.ok(payload.validationFlags.some(flag => flag.source === 'rule_based' && flag.ruleId === 'audit.i2c-pullup-missing'));
  assert.ok(payload.validationFlags.some(flag => flag.source === 'formal_verifier' && flag.ruleId === 'formal.output-drive-grounded-net'));
  assert.ok(payload.ruleFindings.some(issue => issue.sourceBucket != null));
});
