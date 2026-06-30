import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { importKiCadSchematic } from '@/lib/kicad-sch-parser';
import { parseKiCadSchematicToLightweightValidationJson, parseKiCadSchematicToUnifiedCircuitModel } from '@/lib/v3-kicad-parser';
import type { ImportedSchematicPrimitive, ImportedSchematicScene, ImportedSchematicSceneSymbol } from '@/types';

type ImportedTextPrimitive = Extract<ImportedSchematicPrimitive, { kind: 'text' }>;
type ImportedPolylinePrimitive = Extract<ImportedSchematicPrimitive, { kind: 'polyline' }>;

function isTextPrimitive(primitive: ImportedSchematicPrimitive): primitive is ImportedTextPrimitive {
  return primitive.kind === 'text';
}

function isPolylinePrimitive(primitive: ImportedSchematicPrimitive): primitive is ImportedPolylinePrimitive {
  return primitive.kind === 'polyline';
}

function findTextPrimitive(
  primitives: ImportedSchematicPrimitive[] | undefined,
  predicate: (primitive: ImportedTextPrimitive) => boolean
) {
  return (primitives ?? []).filter(isTextPrimitive).find(predicate);
}

function findPolylinePrimitive(
  primitives: ImportedSchematicPrimitive[] | undefined,
  predicate: (primitive: ImportedPolylinePrimitive) => boolean
) {
  return (primitives ?? []).filter(isPolylinePrimitive).find(predicate);
}

function filterTextPrimitives(
  primitives: ImportedSchematicPrimitive[] | undefined,
  predicate: (primitive: ImportedTextPrimitive) => boolean
) {
  return (primitives ?? []).filter(isTextPrimitive).filter(predicate);
}

function findTextByRole(
  primitives: ImportedSchematicPrimitive[] | undefined,
  role: ImportedTextPrimitive['role'],
  text?: string
) {
  return findTextPrimitive(
    primitives,
    primitive => primitive.role === role && (text ? primitive.text === text : true)
  );
}

function findSymbolText(
  symbol: ImportedSchematicSceneSymbol | undefined,
  text: string,
  role?: 'reference' | 'value' | 'annotation' | 'pin-name' | 'pin-number'
) {
  return findTextPrimitive(
    symbol?.primitives,
    primitive => primitive.text === text && (role ? primitive.role === role : true)
  );
}

function countPrimitivesByKind(
  primitives: ImportedSchematicPrimitive[] | undefined,
  kind: ImportedSchematicPrimitive['kind']
) {
  return (primitives ?? []).filter(primitive => primitive.kind === kind).length;
}

function hasSceneWireAttachment(
  scene: ImportedSchematicScene,
  point: { x: number; y: number },
  tolerance = 0.6
) {
  return scene.wireSegments.some(segment => {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) {
      return Math.hypot(point.x - segment.start.x, point.y - segment.start.y) <= tolerance;
    }
    const projection = Math.max(
      0,
      Math.min(
        1,
        ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSq
      )
    );
    const nearestX = segment.start.x + dx * projection;
    const nearestY = segment.start.y + dy * projection;
    return Math.hypot(point.x - nearestX, point.y - nearestY) <= tolerance;
  });
}

const PUBLIC_KICAD_PROJECTS = [
  {
    name: 'ZF8HP Transmission_8HPTCUAdapter',
    filePath: '/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/100_samples/ZF8HP Transmission_8HPTCUAdapter.kicad_sch',
    minimums: {
      components: 1,
      sceneSymbols: 1,
      wireSegments: 20,
      lightweightNets: 10,
    },
  },
  {
    name: 'frequency-divider_frequency-divider',
    filePath: '/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/100_samples/frequency-divider_frequency-divider.kicad_sch',
    minimums: {
      components: 20,
      sceneSymbols: 20,
      wireSegments: 10,
      lightweightNets: 20,
    },
  },
  {
    name: 'GDI-STM_boost',
    filePath: '/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/100_samples/GDI-STM_boost.kicad_sch',
    minimums: {
      components: 40,
      sceneSymbols: 40,
      wireSegments: 40,
      lightweightNets: 20,
    },
  },
  {
    name: 'L9779WD-breakout_adc',
    filePath: '/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/100_samples/L9779WD-breakout_adc.kicad_sch',
    minimums: {
      components: 100,
      sceneSymbols: 100,
      wireSegments: 200,
      lightweightNets: 80,
    },
  },
] as const;

for (const fixture of PUBLIC_KICAD_PROJECTS) {
  test(`public KiCad fixture stays parseable end-to-end: ${fixture.name}`, async () => {
    const source = await readFile(fixture.filePath, 'utf8');

    const imported = importKiCadSchematic(source);
    const unified = parseKiCadSchematicToUnifiedCircuitModel(source);
    const lightweight = parseKiCadSchematicToLightweightValidationJson(source);

    const scene = imported.document.importedSchematicScene;
    assert.ok(scene, 'expected imported schematic scene to exist');
    assert.ok(scene?.pageFrame, 'expected page frame to survive for public fixtures');
    assert.ok(imported.document.components.length >= fixture.minimums.components);
    assert.ok((scene?.symbols?.length ?? 0) >= fixture.minimums.sceneSymbols);
    assert.ok((scene?.wireSegments.length ?? 0) >= fixture.minimums.wireSegments);
    assert.ok(lightweight.nets.length >= fixture.minimums.lightweightNets);
    assert.ok(unified.components.length > 0, 'expected unified model components to be present');

    const fallbackishSymbols = (scene?.symbols ?? []).filter(symbol =>
      filterTextPrimitives(
        symbol.primitives,
        primitive =>
          primitive.role === 'annotation' &&
          (/fallback/i.test(primitive.text) || /warning/i.test(primitive.text))
      ).length > 0
    );

    assert.equal(
      fallbackishSymbols.length,
      0,
      'expected public fixtures to stay on native imported primitives without fallback warning badges'
    );
  });
}

test('GDI-STM_boost keeps mirrored driver, protection diode, and passive text geometry stable', async () => {
  const source = await readFile('/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/100_samples/GDI-STM_boost.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const symbols = imported.document.importedSchematicScene?.symbols ?? [];

  const driver = symbols.find(symbol => symbol.reference === 'U24');
  const protectionDiode = symbols.find(symbol => symbol.reference === 'D32');
  const bulkCap = symbols.find(symbol => symbol.reference === 'C116');

  assert.ok(driver);
  assert.ok(protectionDiode);
  assert.ok(bulkCap);

  assert.equal(findSymbolText(driver, 'U24', 'reference')?.textAnchor, 'start');
  assert.equal(findSymbolText(driver, 'IRS21867S', 'value')?.textAnchor, 'start');
  assert.equal(findSymbolText(driver, 'VCC', 'pin-name')?.angle, 90);
  assert.equal(findSymbolText(driver, 'COM', 'pin-name')?.angle, 270);

  assert.equal(findSymbolText(protectionDiode, 'D32', 'reference')?.textAnchor, 'middle');
  assert.equal(findSymbolText(protectionDiode, 'STTH802G-TR', 'value')?.textAnchor, 'middle');
  assert.ok(
    (protectionDiode?.primitives.filter(primitive => primitive.kind === 'circle').length ?? 0) >= 1,
    'expected boost protection diode to preserve its native circular body detail'
  );

  assert.equal(findSymbolText(bulkCap, 'C116', 'reference')?.textAnchor, 'start');
  assert.equal(findSymbolText(bulkCap, '2200uF/50V', 'value')?.textAnchor, 'start');
});

test('L9779WD-breakout_adc keeps multi-unit op-amp, resistor network, and TVS text geometry stable', async () => {
  const source = await readFile('/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/100_samples/L9779WD-breakout_adc.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const symbols = imported.document.importedSchematicScene?.symbols ?? [];

  const u35Units = symbols.filter(symbol => symbol.reference === 'U35');
  const u46Units = symbols.filter(symbol => symbol.reference === 'U46');
  const rn3 = symbols.find(symbol => symbol.reference === 'RN3');
  const d38 = symbols.find(symbol => symbol.reference === 'D38');
  const d40 = symbols.find(symbol => symbol.reference === 'D40');

  assert.ok(u35Units.length >= 5);
  assert.ok(u46Units.length >= 5);
  assert.ok(rn3);
  assert.ok(d38);
  assert.ok(d40);

  for (const symbol of [...u35Units.slice(0, 4), ...u46Units.slice(0, 4)]) {
    assert.equal(
      symbol.primitives.filter(primitive => primitive.kind === 'polyline').length,
      4
    );
    assert.equal(
      symbol.primitives.filter(primitive => primitive.kind === 'text').length,
      2
    );
  }

  assert.equal(findSymbolText(rn3, 'RN3', 'reference')?.angle, 90);
  assert.equal(findSymbolText(rn3, '10k', 'value')?.angle, 90);
  assert.equal(findSymbolText(d38, 'D38', 'reference')?.angle, 90);
  assert.equal(findSymbolText(d40, 'D40', 'reference')?.angle, 90);
});

test('public KiCad fixtures keep representative pin anchors visually attached to imported wires', async () => {
  const cases = [
    {
      filePath: '/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/100_samples/GDI-STM_boost.kicad_sch',
      symbolReference: 'U24',
      expectedPins: ['VCC', 'LO'],
    },
    {
      filePath: '/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/100_samples/L9779WD-breakout_adc.kicad_sch',
      symbolReference: 'RN3',
      expectedPins: ['1', '8'],
    },
  ] as const;

  for (const fixture of cases) {
    const source = await readFile(fixture.filePath, 'utf8');
    const imported = importKiCadSchematic(source);
    const scene = imported.document.importedSchematicScene;
    assert.ok(scene, `expected imported scene for ${fixture.filePath}`);

    const symbols = scene?.symbols ?? [];
    const symbol = symbols.find(candidate => candidate.reference === fixture.symbolReference);
    assert.ok(symbol, `expected ${fixture.symbolReference} to exist in ${fixture.filePath}`);

    for (const pinLabel of fixture.expectedPins) {
      const anchor = symbol?.pinAnchors.find(
        candidate => candidate.label === pinLabel || candidate.number === pinLabel || candidate.pinId === pinLabel
      );
      assert.ok(anchor, `expected ${fixture.symbolReference} pin ${pinLabel} to exist`);
      assert.ok(
        hasSceneWireAttachment(scene!, anchor!.at, 0.8),
        `expected ${fixture.symbolReference} pin ${pinLabel} to stay visually attached to a wire`
      );
    }
  }
});

test('public KiCad fixtures preserve value/reference text needed for downstream analysis', async () => {
  const source = await readFile('/Users/gimdong-il/Desktop/프로그램/modumake/tests/kicad_samples/100_samples/frequency-divider_frequency-divider.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const symbols = imported.document.importedSchematicScene?.symbols ?? [];

  const firstRichSymbol = symbols.find(symbol =>
    countPrimitivesByKind(symbol.primitives, 'text') >= 2 &&
    findTextByRole(symbol.primitives, 'reference') &&
    findTextByRole(symbol.primitives, 'value')
  );

  assert.ok(firstRichSymbol, 'expected at least one symbol with visible reference/value text');
  assert.ok(findPolylinePrimitive(firstRichSymbol?.primitives, primitive => primitive.points.length >= 2));
});
