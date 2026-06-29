import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseKiCadSchematicToLightweightValidationJson,
  parseKiCadSchematicToUnifiedCircuitModel,
} from '@/lib/v3-kicad-parser';

const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (title_block (title "Serializer Check"))
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "R" (id 1) (at 0 -2.54 0))
      (symbol "R_0_1"
        (pin passive line (at -2.54 0 0) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 2.54 0 180) (length 2.54)
          (name "2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
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
  )
  (symbol
    (lib_id "Device:R")
    (at 40 30 0)
    (uuid "res-1")
    (property "Reference" "R1" (id 0) (at 40 26 0))
    (property "Value" "10k" (id 1) (at 40 34 0))
    (property "Footprint" "Resistor_SMD:R_0603" (id 2) (at 40 38 0))
  )
  (symbol
    (lib_id "MCU_RaspberryPi:Raspberry_Pi_2_3")
    (at 60 30 0)
    (uuid "rpi-1")
    (property "Reference" "J1" (id 0) (at 60 26 0))
    (property "Value" "Raspberry Pi 2 3" (id 1) (at 60 34 0))
  )
  (wire (pts (xy 42.54 30) (xy 54.92 30)))
  (wire (pts (xy 60 35.08) (xy 70 35.08)))
  (global_label "button_input" (shape input) (at 54.92 30 0))
  (global_label "3V3" (shape input) (at 70 35.08 0))
  (sheet_instances (path "/" (page "1")))
)`;

test('unified model and lightweight validation json stay aligned on the same parsed core facts', () => {
  const unified = parseKiCadSchematicToUnifiedCircuitModel(schematic);
  const lightweight = parseKiCadSchematicToLightweightValidationJson(schematic);

  assert.equal(lightweight.source.project_name, unified.source.projectName);
  assert.equal(lightweight.components.length, unified.components.length);
  assert.equal(lightweight.nets.length, unified.nets.length);
  assert.equal(lightweight.unresolved.symbols.length, unified.unresolvedSymbols.length);
  assert.equal(lightweight.stats.component_count, unified.stats.componentCount);
  assert.equal(lightweight.stats.net_count, unified.stats.netCount);

  const unifiedR1 = unified.components.find(component => component.reference === 'R1');
  const lightR1 = lightweight.components.find(component => component.ref === 'R1');

  assert.ok(unifiedR1);
  assert.ok(lightR1);
  assert.equal(lightR1?.footprint, unifiedR1?.footprint);
  assert.equal(
    lightR1?.pins.find(pin => pin.pin_number === '2')?.net_label,
    unifiedR1?.pinNetMap['2']?.netLabel
  );

  const unifiedJ1 = unified.components.find(component => component.reference === 'J1');
  const lightJ1 = lightweight.components.find(component => component.ref === 'J1');

  assert.ok(unifiedJ1);
  assert.ok(lightJ1);
  assert.equal(
    lightJ1?.pins.find(pin => pin.pin_number === '11')?.net_label,
    unifiedJ1?.pinNetMap['11']?.netLabel
  );

  const lightBusNet = lightweight.nets.find(net => net.label === 'button_input');
  const unifiedBusNet = unified.nets.find(net => net.primaryLabel === 'button_input');

  assert.ok(lightBusNet);
  assert.ok(unifiedBusNet);
  assert.deepEqual(
    lightBusNet?.connected_pins.map(pin => `${pin.ref}:${pin.pin_number}`).sort(),
    unifiedBusNet?.members.map(member => `${member.reference}:${member.pinNumber}`).sort()
  );
});

test('serializer outputs keep ignored symbols and marker stats aligned with unified model', () => {
  const schematicWithIgnored = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Mechanical:MountingHole"
      (property "Reference" "H" (id 0) (at 0 0 0))
      (property "Value" "MountingHole" (id 1) (at 0 -2.54 0))
    )
    (symbol "power:PWR_FLAG"
      (property "Reference" "#FLG" (id 0) (at 0 0 0))
      (property "Value" "PWR_FLAG" (id 1) (at 0 -2.54 0))
    )
  )
  (symbol
    (lib_id "Mechanical:MountingHole")
    (at 10 10 0)
    (uuid "mh-1")
    (property "Reference" "H1" (id 0) (at 10 8 0))
    (property "Value" "MountingHole" (id 1) (at 10 12 0))
  )
  (symbol
    (lib_id "power:PWR_FLAG")
    (at 20 10 0)
    (uuid "flg-1")
    (property "Reference" "#FLG01" (id 0) (at 20 8 0))
    (property "Value" "PWR_FLAG" (id 1) (at 20 12 0))
  )
  (sheet_instances (path "/" (page "1")))
)`;

  const unified = parseKiCadSchematicToUnifiedCircuitModel(schematicWithIgnored);
  const lightweight = parseKiCadSchematicToLightweightValidationJson(schematicWithIgnored);

  assert.equal(unified.unresolvedSymbols.length, 0);
  assert.equal(unified.ignoredNonElectricalSymbols.length, 1);
  assert.equal(unified.nonComponentMarkers.length, 1);
  assert.equal(lightweight.unresolved.symbols.length, 0);
  assert.equal(lightweight.unresolved.ignored_non_electrical_symbols?.length, 1);
  assert.equal(lightweight.unresolved.non_component_markers?.length, 1);
  assert.equal(lightweight.stats.unresolved_symbol_count, 0);
  assert.equal(lightweight.stats.ignored_non_electrical_symbol_count, 1);
  assert.equal(lightweight.stats.non_component_marker_count, 1);
});
