import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSchematicDomainModel } from '@/lib/v3-kicad-parser/build-schematic-domain-model';
import { parseKiCadSchAst } from '@/lib/v3-kicad-parser/parse-kicad-sch-ast';
import { SchematicConnectivitySolver } from '@/lib/v3-kicad-parser/solve-schematic-connectivity';

test('schematic domain builder resolves symbols, wires, and labels into logical nets', () => {
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
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 2.54 0 180) (length 2.54)
          (name "2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "Sensor:DHT22"
      (property "Reference" "U" (id 0) (at 0 0 0))
      (property "Value" "DHT22" (id 1) (at 0 -2.54 0))
      (symbol "DHT22_0_1"
        (pin passive line (at -2.54 0 0) (length 2.54)
          (name "DATA" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (symbol
    (lib_id "Device:R")
    (at 40 30 0)
    (uuid "res-1")
    (property "Reference" "R1" (id 0) (at 40 26 0))
    (property "Value" "10k" (id 1) (at 40 34 0))
  )
  (symbol
    (lib_id "Sensor:DHT22")
    (at 60 30 0)
    (uuid "dht-1")
    (property "Reference" "U1" (id 0) (at 60 26 0))
    (property "Value" "DHT22" (id 1) (at 60 34 0))
  )
  (wire (pts (xy 42.54 30) (xy 57.46 30)))
  (global_label "DATA" (shape input) (at 42.54 30 0))
  (sheet_instances (path "/" (page "1")))
)`;

  const { root } = parseKiCadSchAst(schematic);
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);
  const dataNet = SchematicConnectivitySolver.findNetByLabel(nets, 'DATA');

  assert.ok(dataNet);
  assert.equal(model.symbols.length, 2);
  assert.equal(model.wires.length, 1);
  assert.equal(dataNet?.members.length, 2);
  assert.deepEqual(
    dataNet?.members.map(member => `${member.reference}:${member.pinNumber}`).sort(),
    ['R1:2', 'U1:2']
  );
});

test('schematic connectivity keeps long-wire links stable with small coordinate drift', () => {
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

  const { root } = parseKiCadSchAst(schematic);
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);
  const longNet = SchematicConnectivitySolver.findNetByLabel(nets, 'LONG_NET');

  assert.ok(longNet);
  assert.equal(longNet?.members.length, 1);
  assert.equal(longNet?.members[0]?.symbolUuid, 'r-1');
  assert.equal(longNet?.members[0]?.instanceId, 'r-1');
  assert.equal(longNet?.members[0]?.reference, 'R1');
  assert.equal(longNet?.members[0]?.libId, 'Device:R');
  assert.equal(longNet?.members[0]?.pinNumber, '1');
  assert.equal(longNet?.members[0]?.pinName, '1');
  assert.equal(longNet?.members[0]?.electricalType, 'passive');
});

test('schematic connectivity does not classify mixed power and ground labels as ground', () => {
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
          (name "~" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (symbol
    (lib_id "Device:R")
    (at 40 30 0)
    (uuid "r-mixed")
    (property "Reference" "R1" (id 0) (at 40 27 0))
    (property "Value" "0R" (id 1) (at 40 33 0))
  )
  (wire (pts (xy 37.46 30) (xy 50 30)))
  (global_label "GND" (shape input) (at 40 30 0))
  (global_label "+12V" (shape input) (at 50 30 0))
  (sheet_instances (path "/" (page "1")))
)`;

  const { root } = parseKiCadSchAst(schematic);
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);
  const mixedNet = SchematicConnectivitySolver.findNetByLabel(nets, 'GND');

  assert.ok(mixedNet);
  assert.equal(mixedNet?.kind, 'unknown');
  assert.equal(mixedNet?.aliases.includes('GND'), true);
  assert.equal(mixedNet?.aliases.includes('+12V'), true);
});

test('schematic domain builder preserves no-connect markers and sheet frames', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols)
  (sheet
    (at 10 20)
    (size 30 40)
    (property "Sheet name" "Power" (id 0) (at 10 18 0))
    (property "Sheet file" "power.kicad_sch" (id 1) (at 10 62 0))
    (pin "VIN" input (at 10 25 0))
  )
  (no_connect (at 73.66 114.935))
  (sheet_instances (path "/" (page "1")))
)`;

  const { root } = parseKiCadSchAst(schematic);
  const model = buildSchematicDomainModel(root);

  assert.equal(model.noConnects.length, 1);
  assert.equal(model.sheets.length, 1);
  assert.equal(model.sheets[0]?.name, 'Power');
  assert.equal(model.sheets[0]?.pins[0]?.name, 'VIN');
});

test('schematic connectivity merges disjoint wires that share the same label text', () => {
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
    (lib_id "Device:R")
    (at 20 20 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 20 18 0))
    (property "Value" "1k" (id 1) (at 20 22 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 80 20 0)
    (uuid "r-2")
    (property "Reference" "R2" (id 0) (at 80 18 0))
    (property "Value" "1k" (id 1) (at 80 22 0))
  )
  (wire (pts (xy 0 20) (xy 17.46 20)))
  (wire (pts (xy 60 20) (xy 77.46 20)))
  (global_label "DATA" (shape input) (at 0 20 0))
  (global_label "DATA" (shape input) (at 60 20 0))
  (sheet_instances (path "/" (page "1")))
)`;

  const { root } = parseKiCadSchAst(schematic);
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);
  const dataNets = nets.filter(net => net.primaryLabel === 'DATA' || net.aliases.includes('DATA'));

  assert.equal(dataNets.length, 1);
  assert.equal(dataNets[0]?.kind, 'signal');
  assert.deepEqual(
    dataNets[0]?.members.map(member => member.reference).sort(),
    ['R1', 'R2']
  );
});

test('schematic connectivity infers ground kind from GND labels across disjoint wires', () => {
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
    (lib_id "Device:R")
    (at 20 20 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 20 18 0))
    (property "Value" "1k" (id 1) (at 20 22 0))
  )
  (wire (pts (xy 0 20) (xy 17.46 20)))
  (global_label "GND" (shape input) (at 0 20 0))
  (sheet_instances (path "/" (page "1")))
)`;

  const { root } = parseKiCadSchAst(schematic);
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);
  const groundNet = SchematicConnectivitySolver.findNetByLabel(nets, 'GND');

  assert.ok(groundNet);
  assert.equal(groundNet?.kind, 'ground');
});

test('schematic connectivity promotes power symbol pin names into net labels when explicit labels are absent', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "power:GND"
      (power)
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "GND" (id 1) (at 0 0 0))
      (symbol "GND_0_1"
        (pin power_in line (at 0 0 270) (length 0)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
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
    (lib_id "power:GND")
    (at 0 20 0)
    (uuid "pwr-1")
    (property "Reference" "#PWR01" (id 0) (at 0 20 0))
    (property "Value" "GND" (id 1) (at 0 20 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 20 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 20 18 0))
    (property "Value" "1k" (id 1) (at 20 22 0))
  )
  (wire (pts (xy 0 20) (xy 17.46 20)))
  (sheet_instances (path "/" (page "1")))
)`;

  const { root } = parseKiCadSchAst(schematic);
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);
  const groundNet = SchematicConnectivitySolver.findNetByLabel(nets, 'GND');

  assert.ok(groundNet);
  assert.equal(groundNet?.kind, 'ground');
  assert.deepEqual(groundNet?.aliases, ['GND']);
});

test('schematic connectivity classifies AGND as ground and AVCC as power', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "power:AGND"
      (power)
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "AGND" (id 1) (at 0 0 0))
      (symbol "AGND_0_1"
        (pin power_in line (at 0 0 270) (length 0)
          (name "AGND" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "power:AVCC"
      (power)
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "AVCC" (id 1) (at 0 0 0))
      (symbol "AVCC_0_1"
        (pin power_in line (at 0 0 270) (length 0)
          (name "AVCC" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
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
    (lib_id "power:AGND")
    (at 0 20 0)
    (uuid "pwr-agnd")
    (property "Reference" "#PWR01" (id 0) (at 0 20 0))
    (property "Value" "AGND" (id 1) (at 0 20 0))
  )
  (symbol
    (lib_id "power:AVCC")
    (at 0 40 0)
    (uuid "pwr-avcc")
    (property "Reference" "#PWR02" (id 0) (at 0 40 0))
    (property "Value" "AVCC" (id 1) (at 0 40 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 20 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 20 18 0))
    (property "Value" "1k" (id 1) (at 20 22 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 40 0)
    (uuid "r-2")
    (property "Reference" "R2" (id 0) (at 20 38 0))
    (property "Value" "1k" (id 1) (at 20 42 0))
  )
  (wire (pts (xy 0 20) (xy 17.46 20)))
  (wire (pts (xy 0 40) (xy 17.46 40)))
  (sheet_instances (path "/" (page "1")))
)`;

  const { root } = parseKiCadSchAst(schematic);
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);
  const agndNet = SchematicConnectivitySolver.findNetByLabel(nets, 'AGND');
  const avccNet = SchematicConnectivitySolver.findNetByLabel(nets, 'AVCC');

  assert.ok(agndNet);
  assert.equal(agndNet?.kind, 'ground');
  assert.ok(avccNet);
  assert.equal(avccNet?.kind, 'power');
});

test('schematic connectivity promotes plus-prefixed and analog power symbol names', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "power:+5V"
      (power)
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "+5V" (id 1) (at 0 0 0))
      (symbol "+5V_0_1"
        (pin power_in line (at 0 0 270) (length 0)
          (name "+5V" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "power:VDDA"
      (power)
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "VDDA" (id 1) (at 0 0 0))
      (symbol "VDDA_0_1"
        (pin power_in line (at 0 0 270) (length 0)
          (name "VDDA" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "power:GNDREF"
      (power)
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "GNDREF" (id 1) (at 0 0 0))
      (symbol "GNDREF_0_1"
        (pin power_in line (at 0 0 270) (length 0)
          (name "GNDREF" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
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
    (lib_id "power:+5V")
    (at 0 20 0)
    (uuid "pwr-5v")
    (property "Reference" "#PWR01" (id 0) (at 0 20 0))
    (property "Value" "+5V" (id 1) (at 0 20 0))
  )
  (symbol
    (lib_id "power:VDDA")
    (at 0 40 0)
    (uuid "pwr-vdda")
    (property "Reference" "#PWR02" (id 0) (at 0 40 0))
    (property "Value" "VDDA" (id 1) (at 0 40 0))
  )
  (symbol
    (lib_id "power:GNDREF")
    (at 0 60 0)
    (uuid "pwr-gndref")
    (property "Reference" "#PWR03" (id 0) (at 0 60 0))
    (property "Value" "GNDREF" (id 1) (at 0 60 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 20 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 20 18 0))
    (property "Value" "1k" (id 1) (at 20 22 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 40 0)
    (uuid "r-2")
    (property "Reference" "R2" (id 0) (at 20 38 0))
    (property "Value" "1k" (id 1) (at 20 42 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 60 0)
    (uuid "r-3")
    (property "Reference" "R3" (id 0) (at 20 58 0))
    (property "Value" "1k" (id 1) (at 20 62 0))
  )
  (wire (pts (xy 0 20) (xy 17.46 20)))
  (wire (pts (xy 0 40) (xy 17.46 40)))
  (wire (pts (xy 0 60) (xy 17.46 60)))
  (sheet_instances (path "/" (page "1")))
)`;

  const { root } = parseKiCadSchAst(schematic);
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);
  const plus5vNet = SchematicConnectivitySolver.findNetByLabel(nets, '+5V');
  const canonical5vNet = SchematicConnectivitySolver.findNetByLabel(nets, '5V');
  const vddaNet = SchematicConnectivitySolver.findNetByLabel(nets, 'VDDA');
  const gndrefNet = SchematicConnectivitySolver.findNetByLabel(nets, 'GNDREF');

  assert.ok(plus5vNet);
  assert.equal(plus5vNet?.kind, 'power');
  assert.deepEqual(plus5vNet?.aliases, ['+5V', '5V']);
  assert.equal(canonical5vNet?.netId, plus5vNet?.netId);
  assert.ok(vddaNet);
  assert.equal(vddaNet?.kind, 'power');
  assert.ok(gndrefNet);
  assert.equal(gndrefNet?.kind, 'ground');
});

test('schematic connectivity falls back to power symbol value when the visible power pin name is ~', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "power:GND"
      (power)
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "GND" (id 1) (at 0 0 0))
      (symbol "GND_0_1"
        (pin power_in line (at 0 0 270) (length 0)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "power:+5V"
      (power)
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "+5V" (id 1) (at 0 0 0))
      (symbol "+5V_0_1"
        (pin power_in line (at 0 0 270) (length 0)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
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
    (lib_id "power:GND")
    (at 0 20 0)
    (uuid "pwr-gnd")
    (property "Reference" "#PWR01" (id 0) (at 0 20 0))
    (property "Value" "GND" (id 1) (at 0 20 0))
  )
  (symbol
    (lib_id "power:+5V")
    (at 0 40 0)
    (uuid "pwr-5v-tilde")
    (property "Reference" "#PWR02" (id 0) (at 0 40 0))
    (property "Value" "+5V" (id 1) (at 0 40 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 20 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 20 18 0))
    (property "Value" "1k" (id 1) (at 20 22 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 40 0)
    (uuid "r-2")
    (property "Reference" "R2" (id 0) (at 20 38 0))
    (property "Value" "1k" (id 1) (at 20 42 0))
  )
  (wire (pts (xy 0 20) (xy 17.46 20)))
  (wire (pts (xy 0 40) (xy 17.46 40)))
  (sheet_instances (path "/" (page "1")))
)`;

  const { root } = parseKiCadSchAst(schematic);
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);
  const groundNet = SchematicConnectivitySolver.findNetByLabel(nets, 'GND');
  const plus5vNet = SchematicConnectivitySolver.findNetByLabel(nets, '+5V');
  const canonical5vNet = SchematicConnectivitySolver.findNetByLabel(nets, '5V');

  assert.ok(groundNet);
  assert.equal(groundNet?.kind, 'ground');
  assert.deepEqual(groundNet?.aliases, ['GND']);
  assert.ok(plus5vNet);
  assert.equal(plus5vNet?.kind, 'power');
  assert.deepEqual(plus5vNet?.aliases, ['+5V', '5V']);
  assert.equal(canonical5vNet?.netId, plus5vNet?.netId);
});

test('schematic connectivity classifies explicit 12V labels as power', () => {
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
    (lib_id "Device:R")
    (at 20 20 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 20 18 0))
    (property "Value" "1k" (id 1) (at 20 22 0))
  )
  (wire (pts (xy 0 20) (xy 17.46 20)))
  (global_label "12V" (shape input) (at 0 20 0))
  (sheet_instances (path "/" (page "1")))
)`;

  const { root } = parseKiCadSchAst(schematic);
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);
  const powerNet = SchematicConnectivitySolver.findNetByLabel(nets, '12V');

  assert.ok(powerNet);
  assert.equal(powerNet?.kind, 'power');
});

test('schematic connectivity classifies VBUS and VDC rails as power', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "power:VBUS"
      (power)
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "VBUS" (id 1) (at 0 0 0))
      (symbol "VBUS_0_1"
        (pin power_in line (at 0 0 270) (length 0)
          (name "VBUS" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "power:VDC"
      (power)
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "VDC" (id 1) (at 0 0 0))
      (symbol "VDC_0_1"
        (pin power_in line (at 0 0 270) (length 0)
          (name "VDC" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
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
    (lib_id "power:VBUS")
    (at 0 20 0)
    (uuid "pwr-vbus")
    (property "Reference" "#PWR01" (id 0) (at 0 20 0))
    (property "Value" "VBUS" (id 1) (at 0 20 0))
  )
  (symbol
    (lib_id "power:VDC")
    (at 0 40 0)
    (uuid "pwr-vdc")
    (property "Reference" "#PWR02" (id 0) (at 0 40 0))
    (property "Value" "VDC" (id 1) (at 0 40 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 20 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 20 18 0))
    (property "Value" "1k" (id 1) (at 20 22 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 40 0)
    (uuid "r-2")
    (property "Reference" "R2" (id 0) (at 20 38 0))
    (property "Value" "1k" (id 1) (at 20 42 0))
  )
  (wire (pts (xy 0 20) (xy 17.46 20)))
  (wire (pts (xy 0 40) (xy 17.46 40)))
  (sheet_instances (path "/" (page "1")))
)`;

  const { root } = parseKiCadSchAst(schematic);
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);
  const vbusNet = SchematicConnectivitySolver.findNetByLabel(nets, 'VBUS');
  const vdcNet = SchematicConnectivitySolver.findNetByLabel(nets, 'VDC');

  assert.ok(vbusNet);
  assert.equal(vbusNet?.kind, 'power');
  assert.ok(vdcNet);
  assert.equal(vdcNet?.kind, 'power');
});

test('schematic connectivity keeps endpoint joins stable at the exact wire end', () => {
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
    (lib_id "Device:R")
    (at 20 20 0)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 20 18 0))
    (property "Value" "1k" (id 1) (at 20 22 0))
  )
  (wire (pts (xy 0 20) (xy 17.46 20)))
  (global_label "END_NET" (shape input) (at 0 20 0))
  (sheet_instances (path "/" (page "1")))
)`;

  const { root } = parseKiCadSchAst(schematic);
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);
  const net = SchematicConnectivitySolver.findNetByLabel(nets, 'END_NET');

  assert.ok(net);
  assert.deepEqual(
    net?.members.map(member => `${member.reference}:${member.pinNumber}`),
    ['R1:1']
  );
});
