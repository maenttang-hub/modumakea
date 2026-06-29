import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { importKiCadSchematic } from '@/lib/kicad-sch-parser';
import type { ImportedSchematicPrimitive, ImportedSchematicSceneSymbol } from '@/types';

type ImportedTextPrimitive = Extract<ImportedSchematicPrimitive, { kind: 'text' }>;

function isTextPrimitive(primitive: ImportedSchematicPrimitive): primitive is ImportedTextPrimitive {
  return primitive.kind === 'text';
}

function findTextPrimitive(
  primitives: ImportedSchematicPrimitive[] | undefined,
  predicate: (primitive: ImportedTextPrimitive) => boolean
) {
  return (primitives ?? []).filter(isTextPrimitive).find(predicate);
}

function filterTextPrimitives(
  primitives: ImportedSchematicPrimitive[] | undefined,
  predicate: (primitive: ImportedTextPrimitive) => boolean
) {
  return (primitives ?? []).filter(isTextPrimitive).filter(predicate);
}

function findSceneSymbolText(
  symbol: ImportedSchematicSceneSymbol | undefined,
  predicate: (primitive: ImportedTextPrimitive) => boolean
) {
  return findTextPrimitive(symbol?.primitives, predicate);
}

const REFERENCE_ROOT =
  '/Users/gimdong-il/Desktop/프로그램/modumake/pykicadapi/tests/reference_kicad_projects';

function distanceSquared(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function hasAnchorNearPoint(
  points: Array<{ x: number; y: number }>,
  target: { x: number; y: number },
  tolerance = 3
) {
  const toleranceSq = tolerance * tolerance;
  return points.some(point => distanceSquared(point, target) <= toleranceSq);
}

const ROTATED_RESISTOR_FIXTURES = [
  {
    name: '0deg',
    filePath: `${REFERENCE_ROOT}/rotated_resistor_0deg/rotated_resistor_0deg.kicad_sch`,
  },
  {
    name: '90deg',
    filePath: `${REFERENCE_ROOT}/rotated_resistor_90deg/rotated_resistor_90deg.kicad_sch`,
  },
  {
    name: '180deg',
    filePath: `${REFERENCE_ROOT}/rotated_resistor_180deg/rotated_resistor_180deg.kicad_sch`,
  },
  {
    name: '270deg',
    filePath: `${REFERENCE_ROOT}/rotated_resistor_270deg/rotated_resistor_270deg.kicad_sch`,
  },
] as const;

for (const fixture of ROTATED_RESISTOR_FIXTURES) {
  test(`reference fixture keeps rotated resistor pin anchors attached to wire endpoints: ${fixture.name}`, async () => {
    const source = await readFile(fixture.filePath, 'utf8');
    const imported = importKiCadSchematic(source);
    const scene = imported.document.importedSchematicScene;
    const resistor = (scene?.symbols ?? []).find(symbol => symbol.reference === 'R1');

    assert.ok(scene);
    assert.ok(resistor);
    assert.equal(resistor?.pinAnchors.length, 2);
    assert.ok((scene?.wireSegments.length ?? 0) >= 2);

    const anchorPoints = (resistor?.pinAnchors ?? []).map(anchor => anchor.at);
    const wireEndpoints = (scene?.wireSegments ?? []).flatMap(segment => [segment.start, segment.end]);

    for (const anchorPoint of anchorPoints) {
      assert.ok(
        hasAnchorNearPoint(wireEndpoints, anchorPoint),
        `expected resistor pin anchor ${JSON.stringify(anchorPoint)} to stay attached to a wire endpoint`
      );
    }
  });
}

test('reference connector property positioning keeps native texts and visible pin names separated', async () => {
  const source = await readFile(
    `${REFERENCE_ROOT}/property_positioning_connector/connector.kicad_sch`,
    'utf8'
  );
  const imported = importKiCadSchematic(source);
  const scene = imported.document.importedSchematicScene;
  const connector = (scene?.symbols ?? []).find(symbol => symbol.reference === 'J?');

  assert.ok(scene);
  assert.ok(connector);

  const referenceText = findSceneSymbolText(
    connector,
    primitive => primitive.role === 'reference' && primitive.text === 'J?'
  );
  const valueText = findSceneSymbolText(
    connector,
    primitive => primitive.role === 'value' && primitive.text.includes('Conn_01x04_Pin')
  );
  const pinNumberTexts = filterTextPrimitives(
    connector?.primitives,
    primitive => primitive.role === 'pin-number'
  );

  assert.ok(referenceText, 'expected native connector reference text to survive');
  assert.ok(valueText, 'expected native connector value text to survive');
  assert.ok(pinNumberTexts.length >= 4, 'expected visible connector pin numbers');
  assert.equal(referenceText?.angle, 0);
  assert.equal(valueText?.angle, 0);
  assert.ok(
    Math.abs((referenceText?.at.y ?? 0) - (valueText?.at.y ?? 0)) >= 12,
    'expected connector reference/value texts to remain vertically separated'
  );
});

test('reference power symbols keep native ground and voltage primitives visible in scene snapshots', async () => {
  const source = await readFile(
    '/Users/gimdong-il/Desktop/프로그램/modumake/pykicadapi/tests/reference_tests/reference_kicad_projects/power_symbols/power_symbols.kicad_sch',
    'utf8'
  );
  const imported = importKiCadSchematic(source);
  const scene = imported.document.importedSchematicScene;

  assert.ok(scene);

  const symbols = scene?.symbols ?? [];
  const gnd = symbols.find(symbol => symbol.value === 'GND');
  const vdd = symbols.find(symbol => symbol.value === 'VDD');
  const p33 = symbols.find(symbol => symbol.value === '+3.3V');

  assert.ok(gnd, 'expected GND power symbol in scene');
  assert.ok(vdd, 'expected VDD power symbol in scene');
  assert.ok(p33, 'expected +3.3V power symbol in scene');

  for (const symbol of [gnd, vdd, p33]) {
    assert.ok(
      (symbol?.primitives.filter(primitive => primitive.kind === 'polyline').length ?? 0) >= 1,
      `expected ${symbol?.value} to preserve native vector primitives`
    );
    assert.ok(
      symbol?.primitives.some(
        primitive => primitive.kind === 'text' && primitive.role === 'value'
      ),
      `expected ${symbol?.value} to preserve native value text`
    );
  }
});

test('reference logic IC keeps native reference/value texts and active pin texts in the scene snapshot', async () => {
  const source = await readFile(
    `${REFERENCE_ROOT}/property_positioning_logic_ic/logic_ic.kicad_sch`,
    'utf8'
  );
  const imported = importKiCadSchematic(source);
  const scene = imported.document.importedSchematicScene;
  const ic = (scene?.symbols ?? []).find(symbol => symbol.reference === 'U?');

  assert.ok(scene);
  assert.ok(ic);

  const referenceText = findSceneSymbolText(ic, primitive => primitive.role === 'reference');
  const valueText = findSceneSymbolText(ic, primitive => primitive.role === 'value');
  const pinNames = filterTextPrimitives(ic?.primitives, primitive => primitive.role === 'pin-name');
  const pinNumbers = filterTextPrimitives(ic?.primitives, primitive => primitive.role === 'pin-number');

  assert.ok(referenceText, 'expected native IC reference text to survive');
  assert.ok(valueText, 'expected native IC value text to survive');
  assert.ok(pinNames.length >= 8, 'expected active IC pin names to stay visible');
  assert.ok(pinNumbers.length >= 8, 'expected active IC pin numbers to stay visible');
  assert.ok(
    Math.abs((referenceText?.at.y ?? 0) - (valueText?.at.y ?? 0)) >= 12,
    'expected IC reference/value texts to remain well separated vertically'
  );
});
