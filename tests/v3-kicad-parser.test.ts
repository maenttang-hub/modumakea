import test from 'node:test';
import assert from 'node:assert/strict';

import { parseKiCadSchematicToUnifiedCircuitModel } from '@/lib/v3-kicad-parser';

test('v3 KiCad parser extracts components and nets for validation output', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (title_block (title "Blink Review"))
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

  const model = parseKiCadSchematicToUnifiedCircuitModel(schematic);

  assert.equal(model.source.projectName, 'Blink Review');
  assert.equal(model.components.length, 2);
  assert.equal(model.unresolvedSymbols.length, 0);
  assert.ok(model.nets.length >= 2);

  const resistor = model.components.find(component => component.reference === 'R1');
  assert.ok(resistor);
  assert.equal(resistor?.footprint, 'Resistor_SMD:R_0603');
  assert.equal(resistor?.pinNetMap['2']?.netLabel, 'button_input');

  const rpi = model.components.find(component => component.reference === 'J1');
  assert.ok(rpi);
  assert.equal(rpi?.pinNetMap['11']?.netLabel, 'button_input');
  assert.equal(rpi?.pinNetMap['1']?.netLabel, '3V3');
});

test('v3 KiCad parser keeps unresolved symbols explicit instead of silently dropping them', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (symbol "R_0_1"
        (pin passive line (at -2.54 0 0) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (symbol
    (lib_id "Vendor:MissingThing")
    (at 10 10 0)
    (uuid "u-missing")
    (property "Reference" "U1" (id 0) (at 10 8 0))
    (property "Value" "MAX1234" (id 1) (at 10 12 0))
  )
  (sheet_instances (path "/" (page "1")))
)`;

  const model = parseKiCadSchematicToUnifiedCircuitModel(schematic, { projectName: 'Missing Symbols' });

  assert.equal(model.components.length, 1);
  assert.equal(model.components[0]?.reference, 'U1');
  assert.equal(model.components[0]?.pins.length, 0);
  assert.equal(model.unresolvedSymbols.length, 1);
  assert.deepEqual(model.unresolvedSymbols[0], {
    instanceId: 'u-missing',
    reference: 'U1',
    libId: 'Vendor:MissingThing',
    value: 'MAX1234',
    reason: 'missing_library_symbol',
  });
});

test('v3 KiCad parser rejects sub-sheet style input without lib_symbols', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (symbol
    (lib_id "Device:R")
    (at 10 10 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 10 8 0))
    (property "Value" "10k" (id 1) (at 10 12 0))
  )
  (sheet_instances (path "/" (page "2")))
)`;

  assert.throws(
    () => parseKiCadSchematicToUnifiedCircuitModel(schematic),
    /메인 \.kicad_sch 파일을 업로드해 주세요/
  );
});

test('v3 KiCad parser can accept sub-sheet style input when fragment mode is enabled', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (symbol
    (lib_id "Device:R")
    (at 10 10 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 10 8 0))
    (property "Value" "10k" (id 1) (at 10 12 0))
  )
  (wire (pts (xy 0 10) (xy 20 10)))
  (sheet_instances (path "/" (page "2")))
)`;

  const model = parseKiCadSchematicToUnifiedCircuitModel(schematic, { allowFragmentInput: true, projectName: 'Fragment' });

  assert.equal(model.source.projectName, 'Fragment');
  assert.equal(model.components.length, 1);
  assert.equal(model.components[0]?.reference, 'R1');
  assert.equal(model.components[0]?.pins.length, 0);
  assert.equal(model.unresolvedSymbols.length, 1);
  assert.equal(model.stats.wireSegmentCount, 1);
  assert.equal(model.nets.length, 0);
  assert.deepEqual(model.unresolvedSymbols[0], {
    instanceId: 'r-1',
    reference: 'R1',
    libId: 'Device:R',
    value: '10k',
    reason: 'missing_library_symbol',
  });
});

test('v3 KiCad parser keeps wire-only fragments parseable when fragment mode is enabled', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (wire (pts (xy 0 10) (xy 20 10)))
  (wire (pts (xy 20 10) (xy 20 30)))
  (sheet_instances (path "/" (page "2")))
)`;

  const model = parseKiCadSchematicToUnifiedCircuitModel(schematic, { allowFragmentInput: true, projectName: 'Wire Fragment' });

  assert.equal(model.source.projectName, 'Wire Fragment');
  assert.equal(model.components.length, 0);
  assert.equal(model.unresolvedSymbols.length, 0);
  assert.equal(model.stats.wireSegmentCount, 2);
  assert.equal(model.nets.length, 0);
});

test('v3 KiCad parser keeps long-wire connectivity stable with slight coordinate drift', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (symbol "R_0_1"
        (pin passive line (at -2.54 0 0) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 2.54 0 180) (length 2.54)
          (name "2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (symbol
    (lib_id "Device:R")
    (at 100 50 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 100 48 0))
    (property "Value" "1k" (id 1) (at 100 52 0))
  )
  (wire (pts (xy 0 50.0004) (xy 97.46 50.0004)))
  (global_label "LONG_NET" (shape input) (at 0 50 0))
  (sheet_instances (path "/" (page "1")))
)`;

  const model = parseKiCadSchematicToUnifiedCircuitModel(schematic, { projectName: 'Long Wire' });
  const resistor = model.components.find(component => component.reference === 'R1');

  assert.ok(resistor);
  assert.equal(resistor?.pinNetMap['1']?.netLabel, 'LONG_NET');
});

test('v3 KiCad parser keeps symbols with unnamed pins resolvable', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "R" (id 1) (at 0 -2.54 0))
      (symbol "R_0_1"
        (pin passive line (at -2.54 0 0) (length 2.54)
          (name "" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 2.54 0 180) (length 2.54)
          (name "" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (symbol
    (lib_id "Device:R")
    (at 20 20 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 20 18 0))
    (property "Value" "10k" (id 1) (at 20 22 0))
  )
  (sheet_instances (path "/" (page "1")))
)`;

  const model = parseKiCadSchematicToUnifiedCircuitModel(schematic, { projectName: 'Unnamed Pins' });
  const resistor = model.components.find(component => component.reference === 'R1');

  assert.ok(resistor);
  assert.equal(model.unresolvedSymbols.length, 0);
  assert.equal(resistor?.pins.length, 2);
  assert.equal(resistor?.pins[0]?.pinName, '1');
  assert.equal(resistor?.pins[1]?.pinName, '2');
});

test('v3 KiCad parser classifies non-electrical symbols and markers separately from unresolved symbols', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Mechanical:MountingHole"
      (property "Reference" "H" (id 0) (at 0 0 0))
      (property "Value" "MountingHole" (id 1) (at 0 -2.54 0))
    )
    (symbol "rusefi_logo:RUSEFI_LOGO"
      (property "Reference" "G" (id 0) (at 0 0 0))
      (property "Value" "RUSEFI_LOGO" (id 1) (at 0 -2.54 0))
    )
    (symbol "power:PWR_FLAG"
      (property "Reference" "#FLG" (id 0) (at 0 0 0))
      (property "Value" "PWR_FLAG" (id 1) (at 0 -2.54 0))
    )
    (symbol "Vendor:BrokenThing"
      (property "Reference" "U" (id 0) (at 0 0 0))
      (property "Value" "BrokenThing" (id 1) (at 0 -2.54 0))
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
    (lib_id "rusefi_logo:RUSEFI_LOGO")
    (at 20 10 0)
    (uuid "logo-1")
    (property "Reference" "G1" (id 0) (at 20 8 0))
    (property "Value" "RUSEFI_LOGO" (id 1) (at 20 12 0))
  )
  (symbol
    (lib_id "power:PWR_FLAG")
    (at 30 10 0)
    (uuid "flg-1")
    (property "Reference" "#FLG01" (id 0) (at 30 8 0))
    (property "Value" "PWR_FLAG" (id 1) (at 30 12 0))
  )
  (symbol
    (lib_id "Vendor:BrokenThing")
    (at 40 10 0)
    (uuid "broken-1")
    (property "Reference" "U1" (id 0) (at 40 8 0))
    (property "Value" "BrokenThing" (id 1) (at 40 12 0))
  )
  (sheet_instances (path "/" (page "1")))
)`;

  const model = parseKiCadSchematicToUnifiedCircuitModel(schematic, { projectName: 'Ignored Symbols' });

  assert.equal(
    model.components.some(component => component.reference === 'U1' && component.pins.length === 0),
    true
  );
  assert.equal(model.unresolvedSymbols.length, 1);
  assert.deepEqual(model.unresolvedSymbols[0], {
    instanceId: 'broken-1',
    reference: 'U1',
    libId: 'Vendor:BrokenThing',
    value: 'BrokenThing',
    reason: 'symbol_without_pins',
  });
  assert.equal(model.ignoredNonElectricalSymbols.length, 2);
  assert.deepEqual(
    model.ignoredNonElectricalSymbols.map(symbol => `${symbol.reference}:${symbol.reason}`).sort(),
    ['G1:logo', 'H1:mounting_hole']
  );
  assert.equal(model.nonComponentMarkers.length, 1);
  assert.equal(model.nonComponentMarkers[0]?.reference, '#FLG01');
  assert.equal(model.stats.unresolvedSymbolCount, 1);
  assert.equal(model.stats.ignoredNonElectricalSymbolCount, 2);
  assert.equal(model.stats.nonComponentMarkerCount, 1);
});
