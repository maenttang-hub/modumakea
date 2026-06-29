import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractKiCadSymbols,
  kicadSymbolToCustomComponentPackage,
  renderCustomComponentPackagesModule,
} from '@/lib/kicad-sym-parser';

const SAMPLE_KICAD_SYMBOL = `
(kicad_symbol_lib
  (version 20231120)
  (generator "modumake-test")
  (symbol "Sensor:SHT31"
    (property "Reference" "U" (id 0) (at 0 7.62 0))
    (property "Value" "SHT31" (id 1) (at 0 -7.62 0))
    (property "Footprint" "Sensor:SHT31_Breakout" (id 2) (at 0 -10.16 0))
    (property "Description" "Humidity and temperature sensor" (id 3) (at 0 -12.7 0))
    (symbol "SHT31_0_1"
      (rectangle (start -5.08 5.08) (end 5.08 -5.08))
      (pin power_in line (at -7.62 2.54 0) (length 2.54)
        (name "VCC")
        (number "1"))
      (pin power_in line (at -7.62 0 0) (length 2.54)
        (name "GND")
        (number "2"))
      (pin bidirectional line (at 7.62 2.54 180) (length 2.54)
        (name "SDA")
        (number "3"))
      (pin bidirectional line (at 7.62 0 180) (length 2.54)
        (name "SCL")
        (number "4"))
    )
  )
)
`;

test('extractKiCadSymbols reads root symbol metadata and pins from a .kicad_sym document', () => {
  const symbols = extractKiCadSymbols(SAMPLE_KICAD_SYMBOL);

  assert.equal(symbols.length, 1);
  assert.equal(symbols[0].name, 'Sensor:SHT31');
  assert.equal(symbols[0].displayName, 'SHT31');
  assert.equal(symbols[0].referencePrefix, 'U');
  assert.equal(symbols[0].footprint, 'Sensor:SHT31_Breakout');
  assert.deepEqual(
    symbols[0].pins.map(pin => [pin.number, pin.name, pin.side]),
    [
      ['1', 'VCC', 'left'],
      ['2', 'GND', 'left'],
      ['3', 'SDA', 'right'],
      ['4', 'SCL', 'right'],
    ]
  );
});

test('kicadSymbolToCustomComponentPackage maps KiCad pins into a ModuMake custom component package', () => {
  const [symbol] = extractKiCadSymbols(SAMPLE_KICAD_SYMBOL);
  const pkg = kicadSymbolToCustomComponentPackage(symbol, { templateIdPrefix: 'imported' });

  assert.equal(pkg.templateId, 'imported_sht31');
  assert.equal(pkg.name, 'SHT31');
  assert.equal(pkg.schematic?.referencePrefix, 'U');
  assert.deepEqual(
    pkg.requiredPins.map(pin => [pin.name, pin.allowedTypes.join('/'), pin.preferredSide]),
    [
      ['VCC', 'POWER', 'left'],
      ['GND', 'GND', 'left'],
      ['SDA', 'DIGITAL/PWM', 'right'],
      ['SCL', 'DIGITAL/PWM', 'right'],
    ]
  );
});

test('renderCustomComponentPackagesModule emits a reusable TypeScript module payload', () => {
  const [symbol] = extractKiCadSymbols(SAMPLE_KICAD_SYMBOL);
  const pkg = kicadSymbolToCustomComponentPackage(symbol);
  const rendered = renderCustomComponentPackagesModule([pkg]);

  assert.match(rendered, /KICAD_IMPORTED_COMPONENT_PACKAGES/);
  assert.match(rendered, /"templateId": "kicad_sht31"/);
  assert.match(rendered, /"name": "SHT31"/);
});
