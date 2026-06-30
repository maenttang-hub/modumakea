import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIntegratedValidationJson } from '@/lib/build-integrated-validation-json';
import { parseKiCadSchematicToUnifiedCircuitModel } from '@/lib/v3-kicad-parser';

const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (title_block (title "Integrated Builder"))
  (lib_symbols
    (symbol "MCU_RaspberryPi:Raspberry_Pi_2_3"
      (property "Reference" "J" (id 0) (at 0 0 0))
      (property "Value" "Raspberry_Pi_2_3" (id 1) (at 0 -2.54 0))
      (symbol "RPi_0_1"
        (pin bidirectional line (at -5.08 0 0) (length 2.54)
          (name "GPIO17" (effects (font (size 1.27 1.27))))
          (number "11" (effects (font (size 1.27 1.27)))))
        (pin power_out line (at 0 5.08 270) (length 2.54)
          (name "3V3" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "Sensor:Temp"
      (property "Reference" "U" (id 0) (at 0 0 0))
      (property "Value" "DHT22" (id 1) (at 0 -2.54 0))
      (symbol "Temp_0_1"
        (pin bidirectional line (at -2.54 0 0) (length 2.54)
          (name "DATA" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
        (pin power_in line (at -2.54 2.54 0) (length 2.54)
          (name "VCC" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (symbol
    (lib_id "MCU_RaspberryPi:Raspberry_Pi_2_3")
    (at 60 30 0)
    (uuid "rpi-1")
    (property "Reference" "J1" (id 0) (at 60 26 0))
    (property "Value" "Raspberry Pi 2 3" (id 1) (at 60 34 0))
  )
  (symbol
    (lib_id "Sensor:Temp")
    (at 40 30 0)
    (uuid "temp-1")
    (property "Reference" "U1" (id 0) (at 40 26 0))
    (property "Value" "DHT22" (id 1) (at 40 34 0))
  )
  (wire (pts (xy 42.54 30) (xy 54.92 30)))
  (wire (pts (xy 60 35.08) (xy 70 35.08)))
  (global_label "GPIO17" (shape input) (at 54.92 30 0))
  (global_label "3V3" (shape input) (at 70 35.08 0))
  (sheet_instances (path "/" (page "1")))
)`;

test('buildIntegratedValidationJson turns unified model into provider-neutral integrated payload and merges code pin usage', () => {
  const unifiedModel = parseKiCadSchematicToUnifiedCircuitModel(schematic);

  const payload = buildIntegratedValidationJson({
    unifiedModel,
    boardId: 'rpi_pico',
    boardName: 'Raspberry Pi style board',
    boardPinNames: ['GPIO17', '3V3', 'GND'],
    sourceCode: `
      void setup() {
        pinMode(GPIO17, INPUT);
        digitalWrite(GPIO99, HIGH);
      }
    `,
    auditIssues: [
      {
        severity: 'warning',
        title: 'Pull-up missing',
        message: 'Signal pull-up is missing.',
        code: 'audit.pullup-missing',
        ruleId: 'audit.pullup-missing',
        recommendation: 'Add a pull-up resistor.',
      },
    ],
    formalReport: {
      analyzed: true,
      operationCount: 2,
      issueCount: 1,
      issues: [
        {
          severity: 'error',
          title: 'Unwired pin reference',
          message: 'Code uses a pin that is not connected.',
          code: 'formal.unwired-pin-reference',
          ruleId: 'formal.unwired-pin-reference',
          boardPin: 'GPIO99',
          line: 3,
          operation: 'digitalWrite',
          recommendation: 'Reconnect the pin or change the code.',
        },
      ],
    },
  });

  assert.equal(payload.project.projectName, 'Integrated Builder');
  assert.equal(payload.components.length, 2);
  assert.deepEqual(payload.components.find(component => component.reference === 'U1')?.netLabels ?? null, []);
  assert.ok(payload.nets.some(net => net.memberRefs.some(member => member.ownerType === 'board' && member.pinId === 'GPIO17')));
  assert.equal(payload.codePinUsage.length, 2);
  assert.equal(payload.codePinUsage[0]?.matchedMcuPinLabel, 'GPIO17');
  assert.ok(payload.codePinUsage[0]?.connectedComponentReferences.includes('J1'));
  assert.equal(payload.codePinUsage[1]?.matchedMcuPinLabel, null);
  assert.equal(payload.validationFlags.length, 2);
  assert.ok(payload.extractionPlan.targets.some(target => target.reference === 'U1'));
});

test('buildIntegratedValidationJson excludes KiCad power symbols from datasheet review components', () => {
  const powerSymbolSchematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (title_block (title "Power symbols"))
  (lib_symbols
    (symbol "custom:+3.3V"
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "+3.3V" (id 1) (at 0 -2.54 0))
      (symbol "P3V3_0_1"
        (pin power_in line (at 0 0 270) (length 2.54)
          (name "+3.3V" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "R" (id 1) (at 0 -2.54 0))
      (symbol "R_0_1"
        (pin passive line (at -2.54 0 0) (length 2.54)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (symbol
    (lib_id "custom:+3.3V")
    (at 20 20 0)
    (uuid "pwr-1")
    (property "Reference" "#PWR01" (id 0) (at 20 18 0))
    (property "Value" "+3.3V" (id 1) (at 20 22 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 30 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 20 28 0))
    (property "Value" "10k" (id 1) (at 20 32 0))
  )
  (wire (pts (xy 20 22.54) (xy 20 30)))
  (sheet_instances (path "/" (page "1")))
)`;
  const unifiedModel = parseKiCadSchematicToUnifiedCircuitModel(powerSymbolSchematic);

  const payload = buildIntegratedValidationJson({
    unifiedModel,
    boardId: 'uno',
  });

  assert.equal(unifiedModel.components.some(component => component.reference === '#PWR01'), true);
  assert.equal(payload.components.some(component => component.reference === '#PWR01'), false);
  assert.equal(payload.components.some(component => component.reference === 'R1'), true);
  assert.equal(payload.extractionPlan.targets.some(target => target.reference === '#PWR01'), false);
});

test('buildIntegratedValidationJson keeps no-pin custom symbols as reportable review components', () => {
  const noPinSymbolSchematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (title_block (title "No-pin symbols"))
  (lib_symbols
    (symbol "Vendor:PanelMeter"
      (property "Reference" "U" (id 0) (at 0 0 0))
      (property "Value" "PanelMeter" (id 1) (at 0 -2.54 0))
    )
    (symbol "power:+5V"
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "+5V" (id 1) (at 0 -2.54 0))
    )
  )
  (symbol
    (lib_id "Vendor:PanelMeter")
    (at 20 20 0)
    (uuid "meter-1")
    (property "Reference" "U1" (id 0) (at 20 18 0))
    (property "Value" "PM-128" (id 1) (at 20 22 0))
  )
  (symbol
    (lib_id "power:+5V")
    (at 20 10 0)
    (uuid "pwr-1")
    (property "Reference" "#PWR01" (id 0) (at 20 8 0))
    (property "Value" "+5V" (id 1) (at 20 12 0))
  )
  (sheet_instances (path "/" (page "1")))
)`;
  const unifiedModel = parseKiCadSchematicToUnifiedCircuitModel(noPinSymbolSchematic);

  const payload = buildIntegratedValidationJson({
    unifiedModel,
    boardId: 'uno',
  });

  assert.equal(unifiedModel.components.some(component => component.reference === 'U1'), true);
  assert.equal(unifiedModel.unresolvedSymbols.some(symbol => symbol.reference === 'U1'), true);
  assert.equal(payload.components.some(component => component.reference === 'U1' && component.pins.length === 0), true);
  assert.equal(payload.components.some(component => component.reference === '#PWR01'), false);
  assert.equal(payload.extractionPlan.targets.some(target => target.reference === 'U1'), true);
});
