import testRunner from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { getStaticTemplateById } from '@/constants/component-templates';
import { analyzeCircuitNetlist } from '@/lib/circuit-netlist';
import { customComponentPackageToTemplate } from '@/lib/custom-component-packages';
import { runProjectDrc } from '@/lib/drc-engine';
import { getImportedNetLabelDisplay } from '@/lib/imported-schematic-render';
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

function findPolylinePrimitive(
  primitives: ImportedSchematicPrimitive[] | undefined,
  predicate: (primitive: ImportedPolylinePrimitive) => boolean
) {
  return (primitives ?? []).filter(isPolylinePrimitive).find(predicate);
}

function countPrimitivesByKind(
  primitives: ImportedSchematicPrimitive[] | undefined,
  kind: ImportedSchematicPrimitive['kind']
) {
  return (primitives ?? []).filter(primitive => primitive.kind === kind).length;
}

// These fixtures are pinned to the current unified parser behavior, which now
// promotes imported scene symbols directly into structured unified/lightweight components
// instead of leaving many of them in unresolved fallback buckets.
const REAL_KICAD_PROJECTS = [
  {
    name: 'Arduino_hat',
    filePath: '/Users/gimdong-il/Downloads/KICAD-main/Arduino hat/Arduino_hat.kicad_sch',
    expected: {
      legacySceneSymbols: 21,
      legacyWireSegments: 73,
      legacyLabels: 54,
      unifiedComponents: 21,
      unifiedUnresolved: 0,
      lightweightNets: 39,
    },
  },
  {
    name: 'rasphat_proj2',
    filePath: '/Users/gimdong-il/Downloads/KICAD-main/rasphat_proj2/rasphat_proj2.kicad_sch',
    expected: {
      legacySceneSymbols: 16,
      legacyWireSegments: 34,
      legacyLabels: 8,
      unifiedComponents: 16,
      unifiedUnresolved: 0,
      lightweightNets: 42,
    },
  },
  {
    name: 'Flamingo p',
    filePath: '/Users/gimdong-il/Downloads/KICAD-main/Flamingo cotnrol project/Flamingo p.kicad_sch',
    expected: {
      legacySceneSymbols: 85,
      legacyWireSegments: 194,
      legacyLabels: 22,
      unifiedComponents: 85,
      unifiedUnresolved: 0,
      lightweightNets: 93,
    },
  },
  {
    name: 'MATRIX PROJECT',
    filePath: '/Users/gimdong-il/Downloads/KICAD-main/MATRIX PROJECT/MATRIX PROJECT.kicad_sch',
    expected: {
      legacySceneSymbols: 112,
      legacyWireSegments: 441,
      legacyLabels: 71,
      unifiedComponents: 112,
      unifiedUnresolved: 0,
      lightweightNets: 227,
    },
  },
  {
    name: 'P_supply',
    filePath: '/Users/gimdong-il/Downloads/KICAD-main/Breadboard-powersupply/P_supply.kicad_sch',
    expected: {
      legacySceneSymbols: 17,
      legacyWireSegments: 56,
      legacyLabels: 3,
      unifiedComponents: 17,
      unifiedUnresolved: 0,
      lightweightNets: 14,
    },
  },
  {
    name: 'transmier',
    filePath: '/Users/gimdong-il/Downloads/KICAD-main/transmier circuit/transmier.kicad_sch',
    expected: {
      legacySceneSymbols: 18,
      legacyWireSegments: 49,
      legacyLabels: 4,
      unifiedComponents: 18,
      unifiedUnresolved: 0,
      lightweightNets: 13,
    },
  },
] as const;

const ADDITIONAL_STRESS_FIXTURES = [
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
    filePath: '/Users/gimdong-il/Downloads/KICAD-main/GDI-STM_boost.kicad_sch',
    minimums: {
      components: 40,
      sceneSymbols: 40,
      wireSegments: 40,
      lightweightNets: 20,
    },
  },
  {
    name: 'L9779WD-breakout_adc',
    filePath: '/Users/gimdong-il/Downloads/KICAD-main/L9779WD-breakout_adc.kicad_sch',
    minimums: {
      components: 100,
      sceneSymbols: 100,
      wireSegments: 200,
      lightweightNets: 80,
    },
  },
] as const;

const REAL_FIXTURE_PATHS = [
  ...REAL_KICAD_PROJECTS.map(project => project.filePath),
  ...ADDITIONAL_STRESS_FIXTURES.map(project => project.filePath),
];

const hasRealFixtures =
  process.env.MODUMAKE_REAL_FIXTURES === '1' ||
  REAL_FIXTURE_PATHS.every(filePath => existsSync(filePath));

const test = hasRealFixtures ? testRunner : testRunner.skip;

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

function assertVerticalDiodeOrientation(
  symbol: ImportedSchematicSceneSymbol | undefined,
  reference: string,
  expectedCathodeAbove: boolean
) {
  assert.ok(symbol, `expected ${reference} to exist`);
  const cathode = symbol?.pinAnchors.find(pin => pin.number === '1' || pin.label === 'K');
  const anode = symbol?.pinAnchors.find(pin => pin.number === '2' || pin.label === 'A');
  const cathodeBar = findPolylinePrimitive(
    symbol?.primitives,
    primitive => primitive.points.length >= 2 && primitive.points[0]?.x === primitive.points[1]?.x
  );

  assert.ok(cathode);
  assert.ok(anode);
  assert.ok(cathodeBar, `expected ${reference} to keep a visible cathode bar`);

  if (expectedCathodeAbove) {
    assert.ok(cathode!.at.y < anode!.at.y, `expected ${reference} cathode to stay above the anode`);
  } else {
    assert.ok(cathode!.at.y > anode!.at.y, `expected ${reference} cathode to stay below the anode`);
  }

  const barX = cathodeBar?.points[0]?.x ?? 0;
  assert.ok(
    Math.abs(barX - cathode!.at.x) <= 20,
    `expected ${reference} cathode bar to stay visually tied to the cathode side`
  );
}

function assertHorizontalDiodeOrientation(
  symbol: ImportedSchematicSceneSymbol | undefined,
  reference: string,
  expectedCathodeOnRight: boolean
) {
  assert.ok(symbol, `expected ${reference} to exist`);
  const cathode = symbol?.pinAnchors.find(pin => pin.number === '1' || pin.label === 'K');
  const anode = symbol?.pinAnchors.find(pin => pin.number === '2' || pin.label === 'A');
  const cathodeBar = findPolylinePrimitive(
    symbol?.primitives,
    primitive => primitive.points.length >= 2 && primitive.points[0]?.x === primitive.points[1]?.x
  );

  assert.ok(cathode);
  assert.ok(anode);
  assert.ok(cathodeBar, `expected ${reference} to keep a visible cathode bar`);

  if (expectedCathodeOnRight) {
    assert.ok(cathode!.at.x > anode!.at.x, `expected ${reference} cathode to stay on the right`);
  } else {
    assert.ok(cathode!.at.x < anode!.at.x, `expected ${reference} cathode to stay on the left`);
  }

  const barX = cathodeBar?.points[0]?.x ?? 0;
  const minX = Math.min(cathode!.at.x, anode!.at.x);
  const maxX = Math.max(cathode!.at.x, anode!.at.x);
  assert.ok(barX >= minX && barX <= maxX, `expected ${reference} cathode bar to stay between the two pins`);
}

for (const project of REAL_KICAD_PROJECTS) {
  test(`real KiCad project stays parseable end-to-end: ${project.name}`, async () => {
    const source = await readFile(project.filePath, 'utf8');

    const imported = importKiCadSchematic(source);
    const unified = parseKiCadSchematicToUnifiedCircuitModel(source);
    const lightweight = parseKiCadSchematicToLightweightValidationJson(source);

    assert.equal(imported.document.importedSchematicSource, source);
    assert.ok(imported.document.importedSchematicScene, 'expected imported schematic scene to exist');
    assert.equal(imported.document.importedSchematicScene?.symbols?.length ?? 0, project.expected.legacySceneSymbols);
    assert.equal(imported.document.importedSchematicScene?.wireSegments.length ?? 0, project.expected.legacyWireSegments);
    assert.equal(imported.document.importedSchematicScene?.labels.length ?? 0, project.expected.legacyLabels);
    assert.ok(imported.document.importedSchematicScene?.pageFrame, 'expected KiCad page frame to be preserved');

    assert.equal(unified.components.length, project.expected.unifiedComponents);
    assert.equal(unified.unresolvedSymbols.length, project.expected.unifiedUnresolved);
    assert.ok(unified.nets.length > 0, 'expected at least one logical net');

    assert.equal(lightweight.components.length, project.expected.unifiedComponents);
    assert.equal(lightweight.unresolved.symbols.length, project.expected.unifiedUnresolved);
    assert.equal(lightweight.nets.length, project.expected.lightweightNets);
    assert.equal(lightweight.stats.wire_segment_count, project.expected.legacyWireSegments);
    assert.equal(lightweight.stats.label_count, project.expected.legacyLabels);
  });
}

for (const fixture of ADDITIONAL_STRESS_FIXTURES) {
  test(`additional KiCad stress fixture keeps imported scene and validation outputs alive: ${fixture.name}`, async () => {
    const source = await readFile(fixture.filePath, 'utf8');

    const imported = importKiCadSchematic(source);
    const unified = parseKiCadSchematicToUnifiedCircuitModel(source);
    const lightweight = parseKiCadSchematicToLightweightValidationJson(source);

    const scene = imported.document.importedSchematicScene;
    assert.ok(scene, 'expected imported schematic scene to exist');
    assert.ok(imported.document.importedSchematicSource?.length, 'expected imported schematic source to be preserved');
    assert.ok(scene?.pageFrame, 'expected page frame to survive for stress fixtures');
    assert.ok(imported.document.components.length >= fixture.minimums.components);
    const symbols = scene?.symbols ?? [];
    assert.ok(symbols.length >= fixture.minimums.sceneSymbols);
    assert.ok((scene?.wireSegments.length ?? 0) >= fixture.minimums.wireSegments);
    assert.ok(lightweight.nets.length >= fixture.minimums.lightweightNets);
    assert.ok(unified.components.length > 0, 'expected unified model components to be present');

    const fallbackishSymbols = symbols.filter(symbol =>
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
      'expected stress fixtures to stay on native imported primitives without fallback warning badges'
    );
  });
}

test('Arduino_hat keeps passive symbol pin text alignment and top power geometry stable', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/Arduino hat/Arduino_hat.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);

  const resistor = imported.document.components.find(component => component.importedReference === 'R2');
  const capacitor = imported.document.components.find(component => component.importedReference === 'C3');
  const mcuScene = imported.document.importedSchematicScene?.symbols?.find(symbol => symbol.reference === 'U2');

  assert.ok(resistor);
  assert.ok(capacitor);
  assert.ok(mcuScene);

  assert.equal(resistor?.importedGeometry?.pinAnchors.length, 2);
  assert.equal(capacitor?.importedGeometry?.pinAnchors.length, 2);

  const resistorStemCount = mcuScene
    ? countPrimitivesByKind(
        imported.document.importedSchematicScene?.symbols?.find(symbol => symbol.reference === 'R2')?.primitives,
        'polyline'
      )
    : 0;
  assert.ok(resistorStemCount >= 2, 'expected resistor scene snapshot to preserve visible wire stems');

  const rightPinNumber = findSymbolText(mcuScene, '13', 'pin-number');
  const rightPinName = findSymbolText(mcuScene, 'PD7', 'pin-name');
  const leftPinNumber = findSymbolText(mcuScene, '21', 'pin-number');
  const leftPinName = findSymbolText(mcuScene, 'AREF', 'pin-name');
  const topVcc = findSymbolText(mcuScene, 'VCC', 'pin-name');
  const topVccNumber = findSymbolText(mcuScene, '7', 'pin-number');
  const topAvcc = findSymbolText(mcuScene, 'AVCC', 'pin-name');
  const topAvccNumber = findSymbolText(mcuScene, '20', 'pin-number');
  const referenceText = findSymbolText(mcuScene, 'U2', 'reference');
  const valueText = findSymbolText(mcuScene, 'ATmega328P-PU', 'value');

  assert.ok(
    rightPinNumber &&
      rightPinName &&
      leftPinNumber &&
      leftPinName &&
      topVcc &&
      topVccNumber &&
      topAvcc &&
      topAvccNumber &&
      referenceText &&
      valueText
  );
  assert.equal(rightPinNumber.textAnchor, 'start');
  assert.equal(rightPinName.textAnchor, 'end');
  assert.equal(rightPinNumber.baseline, 'middle');
  assert.equal(rightPinName.baseline, 'middle');
  assert.ok(rightPinName.at.x < rightPinNumber.at.x, 'expected right-side MCU pin names to stay inside the body');
  assert.equal(leftPinNumber.textAnchor, 'end');
  assert.equal(leftPinName.textAnchor, 'start');
  assert.equal(leftPinNumber.baseline, 'middle');
  assert.equal(leftPinName.baseline, 'middle');
  assert.ok(leftPinNumber.at.x < leftPinName.at.x, 'expected left-side MCU pin numbers to stay outside the body');
  assert.ok(
    leftPinNumber.at.x > valueText.at.x + 3 && leftPinNumber.at.x > referenceText.at.x + 3,
    'expected left-side MCU pin numbers to stay clear of the reference/value block'
  );
  assert.equal(topVcc.textAnchor, 'middle');
  assert.equal(topVccNumber.textAnchor, 'middle');
  assert.equal(topAvcc.textAnchor, 'middle');
  assert.equal(topAvccNumber.textAnchor, 'middle');
  assert.equal(topVcc.baseline, 'ideographic');
  assert.equal(topVccNumber.baseline, 'ideographic');
  assert.equal(topAvcc.baseline, 'ideographic');
  assert.equal(topAvccNumber.baseline, 'ideographic');
  assert.ok(topVcc.at.x < topAvcc.at.x, 'expected VCC and AVCC top labels to preserve KiCad left/right ordering');
  assert.ok(topVcc.at.y > topVccNumber.at.y, 'expected top-side VCC name to remain below its pin number');
  assert.ok(topAvcc.at.y > topAvccNumber.at.y, 'expected top-side AVCC name to remain below its pin number');
  assert.ok(
    rightPinName.sizeMm <= 0.66 && rightPinNumber.sizeMm <= 0.64,
    'expected dense MCU pin texts to stay compact enough for KiCad-like readability'
  );

  const topGround = imported.document.importedSchematicScene?.symbols?.find(symbol => symbol.reference === '#PWR0106');
  const topFlag = imported.document.importedSchematicScene?.symbols?.find(symbol => symbol.reference === '#FLG0101');
  assert.ok(topGround);
  assert.ok(topFlag);
  assert.ok(
    countPrimitivesByKind(topGround?.primitives, 'polyline') >= 4,
    'expected top ground symbol to use the stabilized fallback shape'
  );
  const topGroundValue = findTextPrimitive(topGround?.primitives, primitive => primitive.role === 'value');
  const topFlagValue = findTextPrimitive(topFlag?.primitives, primitive => primitive.role === 'value');
  const topGroundPolyline = findPolylinePrimitive(topGround?.primitives, primitive => primitive.points.length >= 2);
  const topGroundAngledBranch = findPolylinePrimitive(
    topGround?.primitives,
    primitive =>
      primitive.points.length >= 2 &&
      primitive.points.some((point, index) => {
        if (index === 0) {
          return false;
        }
        const previous = primitive.points[index - 1];
        return previous ? point.x !== previous.x && point.y !== previous.y : false;
      })
  );
  const topFlagPolyline = findPolylinePrimitive(topFlag?.primitives, primitive => primitive.points.length >= 5);
  const topGroundVerticalStem = findPolylinePrimitive(
    topGround?.primitives,
    primitive =>
      primitive.points.length >= 2 &&
      primitive.points[0]?.x === primitive.points[1]?.x &&
      primitive.points[0]?.y !== primitive.points[1]?.y
  );
  const topFlagVerticalStem = findPolylinePrimitive(
    topFlag?.primitives,
    primitive =>
      primitive.points.length >= 2 &&
      primitive.points[0]?.x === primitive.points[1]?.x &&
      primitive.points[0]?.y !== primitive.points[1]?.y
  );
  assert.ok(topGroundValue);
  assert.ok(topFlagValue);
  assert.ok(topGroundPolyline, 'expected GNDPWR to preserve a visible native KiCad branch primitive');
  assert.ok(topGroundAngledBranch, 'expected GNDPWR to preserve at least one angled native branch segment');
  assert.ok(topFlagPolyline, 'expected PWR_FLAG to preserve its native KiCad chevron primitive');
  assert.ok(topGroundVerticalStem, 'expected top GNDPWR to preserve a visible vertical stem tied to the wire anchor');
  assert.ok(topFlagVerticalStem, 'expected top PWR_FLAG to preserve a visible vertical stem tied to the wire anchor');
  assert.equal(topGroundValue?.text, 'GNDPWR');
  assert.equal(topFlagValue?.text, 'PWR_FLAG');
  assert.equal(topGroundValue?.textAnchor, 'middle');
  assert.equal(topGroundValue?.baseline, 'hanging');

  const topPinName = findSymbolText(mcuScene, 'VCC', 'pin-name');
  const mcuReference = findSymbolText(mcuScene, 'U2', 'reference');
  const mcuValue = findSymbolText(mcuScene, 'ATmega328P-PU', 'value');
  assert.equal(topPinName?.textAnchor, 'middle');
  assert.equal(topPinName?.angle, 90);
  assert.equal(mcuReference?.textAnchor, 'end');
  assert.equal(mcuValue?.textAnchor, 'end');
  const topAnalogVcc = findSymbolText(mcuScene, 'AVCC', 'pin-name');
  assert.ok(topAnalogVcc);
  assert.ok(
    Math.abs((topAnalogVcc?.at.x ?? 0) - (topPinName?.at.x ?? 0)) >= 10,
    'expected top-side MCU power labels to stay horizontally separated without spreading too far apart'
  );
  assert.ok(
    (topPinName?.sizeMm ?? 1) <= 0.66 && (topAnalogVcc?.sizeMm ?? 1) <= 0.66,
    'expected top-side MCU power labels to stay visually compact'
  );
  assert.equal(topAnalogVcc?.textAnchor, 'middle');
  assert.equal(topAnalogVcc?.baseline, 'ideographic');

  const sceneLabels = imported.document.importedSchematicScene?.labels ?? [];
  const nearestTopVccLabel = sceneLabels
    .filter(label => label.text === 'VCC')
    .sort(
      (left, right) =>
        Math.hypot(left.at.x - (topPinName?.at.x ?? 0), left.at.y - (topPinName?.at.y ?? 0)) -
        Math.hypot(right.at.x - (topPinName?.at.x ?? 0), right.at.y - (topPinName?.at.y ?? 0))
    )[0];
  const bottomGroundPinName = findSymbolText(mcuScene, 'GND', 'pin-name');
  const nearestBottomGroundLabel = sceneLabels
    .filter(label => label.text === 'GND')
    .sort(
      (left, right) =>
        Math.hypot(left.at.x - (bottomGroundPinName?.at.x ?? 0), left.at.y - (bottomGroundPinName?.at.y ?? 0)) -
        Math.hypot(right.at.x - (bottomGroundPinName?.at.x ?? 0), right.at.y - (bottomGroundPinName?.at.y ?? 0))
    )[0];
  assert.ok(nearestTopVccLabel, 'expected a nearby external VCC label to survive in the imported scene');
  assert.ok(nearestBottomGroundLabel, 'expected a nearby external GND label to survive in the imported scene');
  assert.ok(
    (topPinName?.at.y ?? 0) - (nearestTopVccLabel?.at.y ?? 0) >= 14,
    'expected top-side MCU VCC pin-name text to stay visually separated from the nearby external VCC label'
  );
  assert.ok(
    (nearestBottomGroundLabel?.at.y ?? 0) - (bottomGroundPinName?.at.y ?? 0) >= 14,
    'expected bottom-side MCU GND pin-name text to stay visually separated from the nearby external GND label'
  );
});

test('rasphat_proj2 keeps connector and resistor scene anchors available after import', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/rasphat_proj2/rasphat_proj2.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);

  const connector = imported.document.components.find(component => component.importedReference === 'J1');
  const resistor = imported.document.components.find(component => component.importedReference === 'R2');
  const sceneSymbols = imported.document.importedSchematicScene?.symbols ?? [];
  const connectorSymbol = sceneSymbols.find(symbol => symbol.reference === 'J1');
  const groundSymbol = sceneSymbols.find(symbol => symbol.reference === '#PWR0101');

  assert.ok(connector);
  assert.ok(resistor);
  assert.ok(groundSymbol);

  assert.equal(connector?.importedGeometry?.pinAnchors.length, 40);
  assert.equal(resistor?.importedGeometry?.pinAnchors.length, 2);
  assert.ok(
    (groundSymbol?.primitives.length ?? 0) >= 2,
    'expected imported ground symbol snapshot to retain visible source primitives'
  );

  const rightPinNumber = findSymbolText(connectorSymbol, '3', 'pin-number');
  const rightPinName = findSymbolText(connectorSymbol, 'SDA/GPIO2', 'pin-name');
  const connectorPinTexts = filterTextPrimitives(
    connectorSymbol?.primitives,
    primitive =>
      primitive.role === 'pin-name' &&
      (primitive.text === 'GND' || primitive.text === '3V3' || primitive.text === '5V')
  );

  assert.ok(rightPinNumber && rightPinName);
  assert.equal(rightPinNumber.textAnchor, 'start');
  assert.equal(rightPinName.textAnchor, 'end');
  const leftPinNumber = findSymbolText(connectorSymbol, '8', 'pin-number');
  const leftPinName = findSymbolText(connectorSymbol, 'GPIO14/TXD', 'pin-name');
  assert.ok(leftPinNumber && leftPinName);
  assert.equal(leftPinNumber.textAnchor, 'end');
  assert.equal(leftPinName.textAnchor, 'start');
  const topPowerName = findSymbolText(connectorSymbol, '3V3', 'pin-name');
  const connectorValue = findSymbolText(connectorSymbol, 'Raspberry_Pi_2_3', 'value');
  const connectorReference = findSymbolText(connectorSymbol, 'J1', 'reference');
  assert.ok(topPowerName);
  assert.equal(topPowerName?.angle, 90);
  assert.equal(connectorReference?.textAnchor, 'middle');
  assert.equal(connectorReference?.baseline, 'ideographic');
  assert.equal(connectorValue?.textAnchor, 'middle');
  assert.equal(connectorValue?.baseline, 'ideographic');
  assert.ok(connectorValue, 'expected connector value text to survive as native KiCad property text');
  const topFiveVolt = findSymbolText(connectorSymbol, '5V', 'pin-name');
  assert.ok(topFiveVolt);
  assert.equal(topPowerName?.textAnchor, 'middle');
  assert.equal(topFiveVolt?.textAnchor, 'middle');
  assert.equal(topPowerName?.baseline, 'ideographic');
  assert.equal(topFiveVolt?.baseline, 'ideographic');
  assert.ok(
    Math.abs((topFiveVolt?.at.x ?? 0) - (topPowerName?.at.x ?? 0)) >= 20,
    'expected top connector power labels to stay visually separated'
  );
  assert.ok(
    Math.abs((leftPinName?.at.x ?? 0) - (leftPinNumber?.at.x ?? 0)) >= 23,
    'expected connector left-side pin name and number to keep a readable horizontal gap'
  );
  assert.ok(
    (leftPinName?.sizeMm ?? 0) <= 0.7 && (leftPinNumber?.sizeMm ?? 0) <= 0.7,
    'expected connector pin texts to stay compact enough to avoid app-like crowding'
  );
  assert.ok(
    (topPowerName?.sizeMm ?? 1) <= 0.78 && (topFiveVolt?.sizeMm ?? 1) <= 0.78,
    'expected top connector power labels to stay compact enough for crowded headers'
  );
  assert.equal(
    connectorPinTexts.filter(primitive => primitive.text === '3V3').length,
    1,
    'expected hidden duplicate 3V3 connector pins to stay non-visual'
  );
  assert.equal(
    connectorPinTexts.filter(primitive => primitive.text === '5V').length,
    1,
    'expected hidden duplicate 5V connector pins to stay non-visual'
  );
  assert.equal(
    connectorPinTexts.filter(primitive => primitive.text === 'GND').length,
    1,
    'expected hidden duplicate GND connector pins to stay non-visual'
  );
});

test('rasphat_proj2 preserves no-connect markers and suppresses intentional header pin errors', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/rasphat_proj2/rasphat_proj2.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const scene = imported.document.importedSchematicScene;
  const connector = imported.document.components.find(component => component.importedReference === 'J1');

  assert.ok(scene);
  assert.ok(connector);
  const connectorSymbol = (scene.symbols ?? []).find(symbol => symbol.instanceId === connector.instanceId);
  assert.ok(connectorSymbol);
  const noConnects = scene.noConnects ?? [];
  assert.ok(
    noConnects.length >= 30,
    'expected KiCad no-connect X markers to survive import instead of becoming unconnected-pin errors'
  );

  const hasNoConnectOnPin = (pinId: string) => {
    const anchors = connectorSymbol.pinAnchors.filter(anchor => anchor.pinId === pinId);
    return anchors.some(anchor =>
      noConnects.some(point => Math.hypot(point.x - anchor.at.x, point.y - anchor.at.y) <= 2)
    );
  };

  assert.equal(hasNoConnectOnPin('3V3'), true);
  assert.equal(hasNoConnectOnPin('5V'), true);
  assert.equal(hasNoConnectOnPin('GND'), true);

  const customTemplates = new Map(
    (imported.document.customComponentPackages ?? []).map(pkg => [
      pkg.templateId,
      customComponentPackageToTemplate(pkg),
    ])
  );
  const resolveTemplate = (templateId: string) => getStaticTemplateById(templateId) ?? customTemplates.get(templateId);

  const report = runProjectDrc({
    components: imported.document.components,
    manualConnections: imported.document.manualConnections ?? [],
    boardId: imported.document.activeBoardId,
    resolveTemplate,
    importedSchematicScene: scene,
    powerInputMode: imported.document.powerInputMode,
    componentPowerModes: imported.document.componentPowerModes ?? {},
    componentUnusedPinModes: imported.document.componentUnusedPinModes ?? {},
    generatedCode: imported.document.generatedCode,
    footprintPinPadOverrideCache: {},
  });

  assert.equal(
    report.issues.some(issue =>
      issue.componentName === 'Raspberry_Pi_2_3' &&
      (issue.ruleId === 'imported.power-pin-unconnected' ||
        issue.ruleId === 'imported.ground-pin-unconnected')
    ),
    false
  );
  assert.equal(
    report.issues.some(issue =>
      issue.componentName === 'GND' &&
      issue.ruleId === 'power.dead-short.power-to-ground'
    ),
    false
  );
  assert.deepEqual(
    report.issues.filter(issue => issue.severity === 'error').map(issue => issue.ruleId),
    []
  );
});

test('P_supply keeps rectifier and LED diode direction consistent with pin polarity', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/Breadboard-powersupply/P_supply.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const symbols = imported.document.importedSchematicScene?.symbols ?? [];

  for (const reference of ['D1', 'D2', 'D3', 'D4'] as const) {
    const diode = symbols.find(symbol => symbol.reference === reference);
    const diodeComponent = imported.document.components.find(
      component => component.importedReference === reference
    );
    assert.ok(diode, `expected ${reference} to exist in the imported scene`);
    assert.ok(diodeComponent?.importedGeometry);

    const cathode = diode?.pinAnchors.find(pin => pin.pinId === 'K');
    const anode = diode?.pinAnchors.find(pin => pin.pinId === 'A');
    const cathodeBar = findPolylinePrimitive(
      diode?.primitives,
      primitive =>
        primitive.points.length === 2 &&
        primitive.points[0]?.x === primitive.points[1]?.x
    );

    assert.ok(cathode);
    assert.ok(anode);
    assert.ok(cathodeBar, `expected ${reference} to preserve a visible cathode bar`);
    assert.ok(
      cathode!.at.y < anode!.at.y,
      `expected ${reference} cathode pin to stay above anode pin after vertical rotation`
    );
    assert.ok(
      Math.abs((cathodeBar?.points[0]?.x ?? 0) - cathode!.at.x) <= 1,
      `expected ${reference} cathode bar to stay aligned with the cathode pin column`
    );
    assert.ok(
      (cathodeBar?.points[0]?.y ?? 0) > cathode!.at.y,
      `expected ${reference} cathode bar to remain inside the symbol body below the cathode pin stem`
    );

    const referenceText = findTextByRole(diodeComponent?.importedGeometry?.primitives, 'reference');
    const valueText = findTextByRole(diodeComponent?.importedGeometry?.primitives, 'value');
    const bodyTop = diodeComponent?.importedGeometry?.bounds.minY ?? Number.POSITIVE_INFINITY;

    assert.ok(referenceText && valueText);
    assert.ok(Number.isFinite(bodyTop), `expected ${reference} to expose a drawable body for text spacing checks`);
    assert.ok(
      Math.abs((referenceText?.at.y ?? 0) - bodyTop) <= 0.7,
      `expected ${reference} reference text to stay tucked close to the diode body like KiCad`
    );
    assert.ok(
      Math.abs((valueText?.at.y ?? 0) - bodyTop) <= 0.7,
      `expected ${reference} value text to stay tucked close to the diode body like KiCad`
    );
  }

  for (const reference of ['D5', 'D6'] as const) {
    const led = symbols.find(symbol => symbol.reference === reference);
    assert.ok(led, `expected ${reference} to exist in the imported scene`);

    const cathode = led?.pinAnchors.find(pin => pin.number === '1');
    const anode = led?.pinAnchors.find(pin => pin.number === '2');
    const arrowPrimitives = (led?.primitives ?? []).filter(
      (primitive): primitive is ImportedPolylinePrimitive =>
        primitive.kind === 'polyline' && primitive.points.length >= 4
    );

    assert.ok(cathode);
    assert.ok(anode);
    assert.ok(
      cathode!.at.y > anode!.at.y,
      `expected ${reference} cathode pin to stay below anode pin in the imported LED orientation`
    );
    assert.ok(
      arrowPrimitives.length >= 2,
      `expected ${reference} to preserve its emitted-light arrow primitives`
    );
  }

  const outputConnector = symbols.find(symbol => symbol.reference === 'J2');
  const outputConnectorReference = findTextByRole(outputConnector?.primitives, 'reference');
  const outputConnectorValue = findTextByRole(outputConnector?.primitives, 'value');
  const outputConnectorBody = outputConnector?.primitives.find(
    primitive => primitive.kind === 'rect'
  );
  const secondaryConnector = symbols.find(symbol => symbol.reference === 'J3');
  const secondaryConnectorReference = findTextByRole(secondaryConnector?.primitives, 'reference');
  const secondaryConnectorValue = findTextByRole(secondaryConnector?.primitives, 'value');
  const secondaryConnectorBody = secondaryConnector?.primitives.find(
    primitive => primitive.kind === 'rect'
  );
  assert.ok(outputConnector);
  assert.equal(outputConnectorReference?.textAnchor, 'middle');
  assert.equal(outputConnectorReference?.baseline, 'ideographic');
  assert.equal(outputConnectorValue?.textAnchor, 'middle');
  assert.equal(outputConnectorValue?.baseline, 'ideographic');
  assert.ok(outputConnectorBody && outputConnectorBody.kind === 'rect');
  assert.ok(secondaryConnector);
  assert.ok(secondaryConnectorBody && secondaryConnectorBody.kind === 'rect');
  assert.ok(
    ((outputConnectorBody?.start.y ?? 0) - (outputConnectorReference?.at.y ?? 0)) <= 22,
    'expected J2 reference to stay close to the connector body instead of floating too far above it'
  );
  assert.ok(
    ((outputConnectorBody?.start.y ?? 0) - (outputConnectorValue?.at.y ?? 0)) <= 10,
    'expected J2 value to stay tucked close to the connector body like KiCad'
  );
  assert.ok(
    ((secondaryConnectorBody?.start.y ?? 0) - (secondaryConnectorReference?.at.y ?? 0)) <= 22,
    'expected J3 reference to stay close to the connector body instead of floating too far above it'
  );
  assert.ok(
    ((secondaryConnectorBody?.start.y ?? 0) - (secondaryConnectorValue?.at.y ?? 0)) <= 10,
    'expected J3 value to stay tucked close to the connector body like KiCad'
  );
});

test('rasphat_proj2 keeps DHT22 orientation and LED polarity stable', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/rasphat_proj2/rasphat_proj2.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const symbols = imported.document.importedSchematicScene?.symbols ?? [];

  const dht22 = symbols.find(symbol => symbol.reference === 'U1');
  assert.ok(dht22);

  const vdd = dht22?.pinAnchors.find(pin => pin.number === '1');
  const data = dht22?.pinAnchors.find(pin => pin.number === '2');
  const gnd = dht22?.pinAnchors.find(pin => pin.number === '4');
  assert.ok(vdd && data && gnd);
  assert.equal(vdd?.angle, 90);
  assert.equal(data?.angle, 180);
  assert.equal(gnd?.angle, 270);
  assert.ok(vdd!.at.y < data!.at.y, 'expected DHT22 VDD to stay above the DATA pin');
  assert.ok(gnd!.at.y > data!.at.y, 'expected DHT22 GND to stay below the DATA pin');
  assert.ok(data!.at.x > vdd!.at.x, 'expected DHT22 DATA pin to stay on the right side of the body');
  assert.equal(findSymbolText(dht22, 'U1', 'reference')?.textAnchor, 'end');
  assert.equal(findSymbolText(dht22, 'DHT22', 'value')?.textAnchor, 'end');

  assertVerticalDiodeOrientation(symbols.find(symbol => symbol.reference === 'D1'), 'D1', false);
  assertVerticalDiodeOrientation(symbols.find(symbol => symbol.reference === 'D2'), 'D2', false);
});

test('Arduino_hat keeps horizontal LED polarity and top power symbol orientation stable', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/Arduino hat/Arduino_hat.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const symbols = imported.document.importedSchematicScene?.symbols ?? [];

  assertHorizontalDiodeOrientation(symbols.find(symbol => symbol.reference === 'D1'), 'D1', true);

  const topGround = symbols.find(symbol => symbol.reference === '#PWR0106');
  const topFlag = symbols.find(symbol => symbol.reference === '#FLG0101');
  assert.ok(topGround);
  assert.ok(topFlag);

  const topGroundStem = topGround?.primitives.find(
    primitive =>
      primitive.kind === 'polyline' &&
      primitive.points.length >= 2 &&
      primitive.points[0]?.x === primitive.points[1]?.x &&
      primitive.points[0]?.y !== primitive.points[1]?.y
  );
  const topFlagTip = topFlag?.primitives.find(
    primitive =>
      primitive.kind === 'polyline' &&
      primitive.points.length >= 5 &&
      primitive.points.some(point => point.y < (primitive.points[0]?.y ?? 0))
  );

  assert.ok(topGroundStem, 'expected top GNDPWR to keep a visible vertical stem tied to the wire');
  assert.ok(topFlagTip, 'expected top PWR_FLAG chevron to keep its upward-facing orientation');
});

test('Arduino_hat preserves visible passive values for circuit analysis', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/Arduino hat/Arduino_hat.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const document = imported.document;
  const importedValuesByRef = new Map(
    document.components.map(component => [
      component.importedReference,
      component.value ?? component.importedMapping?.value ?? component.importedGeometry?.valueLabel,
    ])
  );

  assert.equal(importedValuesByRef.get('R1'), '10Kohm');
  assert.equal(importedValuesByRef.get('R2'), '330ohm');
  assert.equal(importedValuesByRef.get('C2'), '10uF');
  assert.equal(importedValuesByRef.get('C3'), '22pF');
  assert.equal(importedValuesByRef.get('C4'), '22pF');

  const report = analyzeCircuitNetlist(
    document.components,
    document.activeBoardId,
    getStaticTemplateById,
    document.manualConnections ?? []
  );
  const componentById = new Map(document.components.map(component => [component.instanceId, component]));
  const resistorByRef = new Map(
    report.resistors.map(resistor => [
      componentById.get(resistor.componentId)?.importedReference,
      resistor,
    ])
  );
  const capacitorByRef = new Map(
    (report.capacitors ?? []).map(capacitor => [
      componentById.get(capacitor.componentId)?.importedReference,
      capacitor,
    ])
  );
  const assertClose = (actual: number | undefined, expected: number) => {
    assert.equal(typeof actual, 'number');
    assert.ok(Math.abs((actual ?? 0) - expected) <= expected * 1e-9);
  };

  assert.equal(resistorByRef.get('R1')?.value, '10Kohm');
  assert.equal(resistorByRef.get('R1')?.resistanceOhms, 10_000);
  assert.equal(resistorByRef.get('R2')?.value, '330ohm');
  assert.equal(resistorByRef.get('R2')?.resistanceOhms, 330);
  assert.equal(capacitorByRef.get('C2')?.value, '10uF');
  assertClose(capacitorByRef.get('C2')?.capacitanceFarads, 10e-6);
  assert.equal(capacitorByRef.get('C3')?.value, '22pF');
  assertClose(capacitorByRef.get('C3')?.capacitanceFarads, 22e-12);
  assert.equal(capacitorByRef.get('C4')?.value, '22pF');
  assertClose(capacitorByRef.get('C4')?.capacitanceFarads, 22e-12);
  assert.equal(
    report.issues.some(issue => issue.ruleId === 'netlist.resistor-value-fallback'),
    false
  );
});

test('Flamingo keeps charger and horizontal diode orientation stable', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/Flamingo cotnrol project/Flamingo p.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const symbols = imported.document.importedSchematicScene?.symbols ?? [];

  const charger = symbols.find(symbol => symbol.reference === 'U2');
  assert.ok(charger);
  assert.equal(findSymbolText(charger, 'PROG', 'pin-name')?.textAnchor, 'end');
  assert.equal(findSymbolText(charger, '2', 'pin-number')?.textAnchor, 'start');
  assert.equal(findSymbolText(charger, 'VCC', 'pin-name')?.textAnchor, 'start');
  assert.equal(findSymbolText(charger, '4', 'pin-number')?.textAnchor, 'end');

  assertHorizontalDiodeOrientation(symbols.find(symbol => symbol.reference === 'D3'), 'D3', true);
  assertHorizontalDiodeOrientation(symbols.find(symbol => symbol.reference === 'D4'), 'D4', true);
  assertHorizontalDiodeOrientation(symbols.find(symbol => symbol.reference === 'D5'), 'D5', true);
  assertHorizontalDiodeOrientation(symbols.find(symbol => symbol.reference === 'D6'), 'D6', true);
});

test('P_supply preserves dashed section boxes and section heading texts as native scene drawings', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/Breadboard-powersupply/P_supply.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const scene = imported.document.importedSchematicScene;
  const drawings = scene?.drawings ?? [];

  const dashedPolylines = drawings.filter(
    primitive => primitive.kind === 'polyline' && primitive.strokeStyle === 'dash'
  );
  const headingTexts = drawings.filter(
    primitive =>
      primitive.kind === 'text' &&
      (
        primitive.text.includes('N1- Input') ||
        primitive.text.includes('N2- Root Bridge Rectifier') ||
        primitive.text.includes('N3 - Voltage regulator') ||
        primitive.text.includes('N7\npower output')
      )
  );

  assert.ok(scene, 'expected imported schematic scene to exist');
  assert.ok(dashedPolylines.length >= 8, 'expected dashed section guide polylines to survive scene export');
  assert.ok(headingTexts.length >= 4, 'expected section heading texts to survive scene export');
});

test('Flamingo project keeps native USB connector, charger IC, and power symbol text geometry intact', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/Flamingo cotnrol project/Flamingo p.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const symbols = imported.document.importedSchematicScene?.symbols ?? [];

  const usbConnector = symbols.find(symbol => symbol.reference === 'J1');
  const chargerIc = symbols.find(symbol => symbol.reference === 'U2');
  const ground = symbols.find(symbol => symbol.reference === '#PWR04');

  assert.ok(usbConnector);
  assert.ok(chargerIc);
  assert.ok(ground);

  assert.equal(
    usbConnector?.primitives.filter(primitive => primitive.kind === 'text' && primitive.role === 'pin-name').length,
    5
  );
  assert.equal(
    usbConnector?.primitives.filter(primitive => primitive.kind === 'text' && primitive.role === 'pin-number').length,
    5
  );

  const usbReference = findTextByRole(usbConnector?.primitives, 'reference');
  const usbValue = findTextByRole(usbConnector?.primitives, 'value');
  assert.equal(usbReference?.angle, 90);
  assert.equal(usbReference?.textAnchor, 'start');
  assert.equal(usbReference?.baseline, 'middle');
  assert.equal(usbValue?.angle, 90);
  assert.equal(usbValue?.textAnchor, 'start');
  assert.equal(usbValue?.baseline, 'middle');
  const usbConnectorGeometry = imported.document.components.find(
    component => component.importedReference === 'J1'
  )?.importedGeometry;
  const usbGeometryReference = findTextByRole(usbConnectorGeometry?.primitives, 'reference');
  const usbGeometryValue = findTextByRole(usbConnectorGeometry?.primitives, 'value');
  assert.ok(usbConnectorGeometry);
  assert.ok(
    Math.abs((usbGeometryReference?.at.y ?? 0) - (usbConnectorGeometry?.bounds.minY ?? 0)) <= 1.2,
    'expected USB connector reference to stay tucked near the top body edge instead of drifting outward'
  );
  assert.ok(
    Math.abs((usbGeometryValue?.at.y ?? 0) - (usbConnectorGeometry?.bounds.minY ?? 0)) <= 1.2,
    'expected USB connector value to stay close to the top body edge instead of floating too far away'
  );

  const usbGroundNumber = findSymbolText(usbConnector, '4', 'pin-number');
  const usbGroundName = findSymbolText(usbConnector, 'GND', 'pin-name');
  const usbShieldNumber = findSymbolText(usbConnector, '5', 'pin-number');
  const usbShieldName = findSymbolText(usbConnector, 'Shield', 'pin-name');
  assert.ok(usbGroundNumber && usbGroundName && usbShieldNumber && usbShieldName);
  assert.equal(usbGroundNumber?.textAnchor, 'end');
  assert.equal(usbGroundNumber?.baseline, 'middle');
  assert.equal(usbGroundName?.textAnchor, 'start');
  assert.equal(usbGroundName?.baseline, 'middle');
  assert.equal(usbShieldNumber?.textAnchor, 'end');
  assert.equal(usbShieldNumber?.baseline, 'middle');
  assert.equal(usbShieldName?.textAnchor, 'start');
  assert.equal(usbShieldName?.baseline, 'middle');

  const chargerReference = findTextByRole(chargerIc?.primitives, 'reference');
  const chargerValue = findTextByRole(chargerIc?.primitives, 'value');
  assert.equal(chargerReference?.textAnchor, 'middle');
  assert.equal(chargerReference?.baseline, 'middle');
  assert.equal(chargerValue?.textAnchor, 'middle');
  assert.equal(chargerValue?.baseline, 'middle');
  const battery = symbols.find(symbol => symbol.reference === 'BT1');
  const batteryReference = findTextByRole(battery?.primitives, 'reference');
  const batteryValue = findTextByRole(battery?.primitives, 'value');
  assert.ok(battery);
  assert.equal(batteryReference?.text, 'BT1');
  assert.equal(batteryReference?.textAnchor, 'middle');
  assert.equal(batteryReference?.baseline, 'middle');
  assert.equal(batteryValue, undefined, 'expected generic Battery value text to stay suppressed');

  const groundValue = findTextByRole(ground?.primitives, 'value');
  assert.equal(groundValue?.textAnchor, 'middle');
  assert.equal(groundValue?.baseline, 'hanging');
});

test('Flamingo project restores rotated USB power pins before DRC audit', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/Flamingo cotnrol project/Flamingo p.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const customTemplates = new Map(
    (imported.document.customComponentPackages ?? []).map(pkg => [
      pkg.templateId,
      customComponentPackageToTemplate(pkg),
    ])
  );
  const resolveTemplate = (templateId: string) => getStaticTemplateById(templateId) ?? customTemplates.get(templateId);

  const report = runProjectDrc({
    components: imported.document.components,
    manualConnections: imported.document.manualConnections ?? [],
    boardId: imported.document.activeBoardId,
    resolveTemplate,
    importedSchematicScene: imported.document.importedSchematicScene,
    powerInputMode: imported.document.powerInputMode,
    componentPowerModes: imported.document.componentPowerModes ?? {},
    componentUnusedPinModes: imported.document.componentUnusedPinModes ?? {},
    generatedCode: imported.document.generatedCode,
    footprintPinPadOverrideCache: {},
  });

  assert.equal(
    report.issues.some(issue =>
      issue.componentName === 'USB_A' &&
      (issue.ruleId === 'imported.power-pin-unconnected' ||
        issue.ruleId === 'imported.ground-pin-unconnected' ||
        issue.ruleId === 'imported.symbol-isolated')
    ),
    false
  );
  assert.equal(
    report.issues.some(issue => issue.componentName === 'FP6291' && issue.ruleId === 'mcu.boot-strap-audit'),
    false
  );
});

test('MATRIX PROJECT keeps connector, shift-register, and power symbol text layout stable', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/MATRIX PROJECT/MATRIX PROJECT.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const symbols = imported.document.importedSchematicScene?.symbols ?? [];

  const connector = symbols.find(symbol => symbol.reference === 'J2');
  const shiftRegister = symbols.find(symbol => symbol.reference === 'U2');
  const ground = symbols.find(symbol => symbol.reference === '#PWR02');
  const sidePower = symbols.find(symbol => symbol.reference === '#PWR05');

  assert.ok(connector);
  assert.ok(shiftRegister);
  assert.ok(ground);
  assert.ok(sidePower);

  assert.equal(
    connector?.primitives.filter(primitive => primitive.kind === 'text' && primitive.role === 'pin-number').length,
    8
  );
  assert.equal(
    connector?.primitives.filter(primitive => primitive.kind === 'text' && primitive.role === 'pin-name').length,
    0
  );

  const connectorReference = findTextPrimitive(connector?.primitives, primitive => primitive.role === 'reference');
  const connectorValue = findTextPrimitive(connector?.primitives, primitive => primitive.role === 'value');
  const connectorNumberTexts = filterTextPrimitives(
    connector?.primitives,
    primitive => primitive.role === 'pin-number'
  );
  const connectorRightmostNumber = Math.max(
    ...(connectorNumberTexts.map(primitive => primitive.at.x) ?? [0])
  );
  assert.equal(connectorReference?.textAnchor, 'start');
  assert.equal(connectorReference?.baseline, 'middle');
  assert.equal(connectorValue?.angle, 90);
  assert.equal(connectorValue?.textAnchor, 'start');
  assert.equal(connectorValue?.baseline, 'middle');
  assert.ok(
    (connectorReference?.at.x ?? 0) - connectorRightmostNumber <= 34,
    'expected one-sided connector references to stay visually close to the body'
  );
  assert.ok(
    (connectorValue?.at.x ?? 0) - connectorRightmostNumber <= 44,
    'expected one-sided connector values to stay visually close to the body'
  );
  const connectorGeometry = imported.document.components.find(
    component => component.importedReference === 'J2'
  )?.importedGeometry;
  const connectorGeometryReference = findTextPrimitive(
    connectorGeometry?.primitives,
    primitive => primitive.role === 'reference'
  );
  const connectorGeometryValue = findTextPrimitive(
    connectorGeometry?.primitives,
    primitive => primitive.role === 'value'
  );
  assert.ok(connectorGeometry);
  assert.ok(
    Math.abs((connectorGeometryReference?.at.x ?? 0) - (connectorGeometry?.bounds.maxX ?? 0)) <= 0.35,
    'expected MATRIX connector references to stay tucked against the body edge'
  );
  assert.ok(
    Math.abs((connectorGeometryValue?.at.x ?? 0) - (connectorGeometry?.bounds.maxX ?? 0)) <= 0.8,
    'expected MATRIX connector values to stay tucked against the body edge'
  );

  assert.equal(
    shiftRegister?.primitives.filter(primitive => primitive.kind === 'text' && primitive.role === 'pin-name').length,
    16
  );
  assert.equal(
    shiftRegister?.primitives.filter(primitive => primitive.kind === 'text' && primitive.role === 'pin-number').length,
    16
  );

  const shiftValue = findTextPrimitive(shiftRegister?.primitives, primitive => primitive.role === 'value');
  assert.equal(shiftValue?.angle, 90);
  assert.equal(shiftValue?.textAnchor, 'middle');
  assert.equal(shiftValue?.baseline, 'middle');

  const groundValue = findTextPrimitive(ground?.primitives, primitive => primitive.role === 'value');
  const sidePowerValue = findTextPrimitive(sidePower?.primitives, primitive => primitive.role === 'value');
  assert.equal(groundValue?.textAnchor, 'middle');
  assert.equal(groundValue?.baseline, 'hanging');
  assert.equal(sidePowerValue?.textAnchor, 'middle');
  assert.ok(
    sidePowerValue?.baseline === 'middle' || sidePowerValue?.baseline === 'ideographic',
    'expected top-side +5V label to stay centered without drifting into pin text'
  );
});

test('Flamingo p keeps connector, capacitor, and ground primitives visible in the scene snapshot', async () => {
  const source = await readFile(
    '/Users/gimdong-il/Downloads/KICAD-main/Flamingo cotnrol project/Flamingo p.kicad_sch',
    'utf8'
  );
  const imported = importKiCadSchematic(source);

  const usbConnector = imported.document.components.find(component => component.importedReference === 'J1');
  const capacitor = imported.document.components.find(component => component.importedReference === 'C8');
  const groundSymbol = imported.document.importedSchematicScene?.symbols?.find(symbol => symbol.reference === '#PWR04');

  assert.ok(usbConnector);
  assert.ok(capacitor);
  assert.ok(groundSymbol);

  assert.equal(usbConnector?.importedGeometry?.pinAnchors.length, 5);
  assert.equal(capacitor?.importedGeometry?.pinAnchors.length, 2);
  const chargerIc = imported.document.components.find(component => component.importedReference === 'U2');
  const chargerIcScene = imported.document.importedSchematicScene?.symbols?.find(symbol => symbol.reference === 'U2');
  assert.ok(chargerIc);
  assert.ok(chargerIcScene);
  assert.equal(chargerIc?.importedGeometry?.pinAnchors.length, 8);
  assert.equal(
    chargerIcScene?.primitives.filter(
      primitive => primitive.kind === 'text' && primitive.role === 'pin-name'
    ).length ?? 0,
    8,
    'expected TP4056 scene snapshot to keep exactly the active unit pin-name texts'
  );
  assert.equal(
    chargerIcScene?.primitives.filter(
      primitive => primitive.kind === 'text' && primitive.role === 'pin-number'
    ).length ?? 0,
    8,
    'expected TP4056 scene snapshot to keep exactly the active unit pin-number texts'
  );
  assert.ok(
    (imported.document.importedSchematicScene?.symbols?.find(symbol => symbol.reference === 'J1')?.primitives.length ?? 0) >= 20,
    'expected USB connector scene snapshot to preserve its native body primitives'
  );
  assert.ok(
    (groundSymbol?.primitives.some(
      primitive => primitive.kind === 'polyline' && primitive.points.length >= 5
    ) ?? false),
    'expected ground symbol to preserve its native KiCad chevron primitive'
  );
});

test('MATRIX PROJECT keeps MCU, connector, and power primitives available after import', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/MATRIX PROJECT/MATRIX PROJECT.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);

  const connector = imported.document.components.find(component => component.importedReference === 'J2');
  const shiftRegister = imported.document.components.find(component => component.importedReference === 'U2');
  const powerSymbol = imported.document.importedSchematicScene?.symbols?.find(symbol => symbol.reference === '#PWR05');

  assert.ok(connector);
  assert.ok(shiftRegister);
  assert.ok(powerSymbol);

  assert.equal(connector?.importedGeometry?.pinAnchors.length, 8);
  assert.equal(shiftRegister?.importedGeometry?.pinAnchors.length, 16);
  const shiftRegisterScene = imported.document.importedSchematicScene?.symbols?.find(symbol => symbol.reference === 'U2');
  assert.ok(shiftRegisterScene);
  assert.equal(
    shiftRegisterScene?.primitives.filter(
      primitive => primitive.kind === 'text' && primitive.role === 'pin-name'
    ).length ?? 0,
    16,
    'expected 74HC595 scene snapshot to keep one pin-name text per active unit pin'
  );
  assert.equal(
    shiftRegisterScene?.primitives.filter(
      primitive => primitive.kind === 'text' && primitive.role === 'pin-number'
    ).length ?? 0,
    16,
    'expected 74HC595 scene snapshot to keep one pin-number text per active unit pin'
  );
  assert.ok(
    (shiftRegisterScene?.primitives.length ?? 0) >= 40,
    'expected MCU scene snapshot to keep its imported primitive body and labels'
  );
  assert.ok(
    (powerSymbol?.primitives.length ?? 0) >= 4,
    'expected +5V power symbol to preserve a visible imported scene primitive set'
  );
});

test('MATRIX PROJECT keeps barrel jack and female headers on connector-style rendering rules', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/MATRIX PROJECT/MATRIX PROJECT.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const symbols = imported.document.importedSchematicScene?.symbols ?? [];

  const barrelJack = symbols.find(symbol => symbol.reference === 'J7');
  const header = symbols.find(symbol => symbol.reference === 'J1');

  assert.ok(barrelJack);
  assert.ok(header);
  assert.equal(barrelJack?.family, 'connector');
  assert.equal(header?.family, 'connector');
  assert.equal(findSymbolText(header, 'J1', 'reference')?.textAnchor, 'start');
  assert.equal(findSymbolText(header, 'SRA', 'value')?.textAnchor, 'start');
  const headerReference = findSymbolText(header, 'J1', 'reference');
  const headerValue = findSymbolText(header, 'SRA', 'value');
  const rightmostNumber = Math.max(
    ...filterTextPrimitives(header?.primitives, primitive => primitive.role === 'pin-number')
      .map(primitive => primitive.at.x)
  , 0);
  assert.ok((headerReference?.at.x ?? 0) - rightmostNumber <= 34);
  assert.ok((headerValue?.at.x ?? 0) - rightmostNumber <= 44);
});

test('MATRIX PROJECT keeps barrel jack pins and BJT semantic pin roles aligned with KiCad library names', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/MATRIX PROJECT/MATRIX PROJECT.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const scene = imported.document.importedSchematicScene;

  const barrelJack = imported.document.components.find(component => component.importedReference === 'J7');
  const q1 = imported.document.components.find(component => component.importedReference === 'Q1');
  const symbols = scene?.symbols ?? [];

  assert.ok(barrelJack);
  assert.ok(q1);
  assert.ok(scene);

  assert.equal(
    barrelJack?.importedGeometry?.pinAnchors.length,
    3,
    'expected barrel jack switch to keep all three native pins instead of collapsing to a button template'
  );
  assert.deepEqual(
    barrelJack?.importedGeometry?.pinAnchors.map(pin => pin.pinId),
    ['1', '2', '3'],
    'expected barrel jack fallback pin ids to preserve the native pin numbers when there is no trustworthy template pin map'
  );

  const q1Anchors = q1?.importedGeometry?.pinAnchors ?? [];
  const q1ByNumber = new Map(q1Anchors.map(pin => [pin.number, pin]));
  assert.equal(q1ByNumber.get('1')?.pinId, 'B');
  assert.equal(q1ByNumber.get('1')?.label, 'B');
  assert.equal(q1ByNumber.get('2')?.pinId, 'E');
  assert.equal(q1ByNumber.get('2')?.label, 'E');
  assert.equal(q1ByNumber.get('3')?.pinId, 'C');
  assert.equal(q1ByNumber.get('3')?.label, 'C');

  const barrelJackScene = symbols.find(symbol => symbol.reference === 'J7');
  assert.ok(barrelJackScene);
  for (const pin of barrelJackScene?.pinAnchors ?? []) {
    assert.ok(
      hasSceneWireAttachment(scene!, pin.at, 0.8),
      `expected MATRIX J7 pin ${pin.number} to stay visually attached to a wire segment`
    );
  }

  for (const reference of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8'] as const) {
    const transistorScene = symbols.find(symbol => symbol.reference === reference);
    assert.ok(transistorScene, `expected ${reference} to exist in the imported scene`);
    for (const pin of transistorScene?.pinAnchors ?? []) {
      assert.ok(
        hasSceneWireAttachment(scene!, pin.at, 0.8),
        `expected ${reference} pin ${pin.number} (${pin.pinId}) to stay visually attached to a wire segment`
      );
    }
  }
});

test('GDI-STM_boost keeps mirrored driver, protection diode, and passive text geometry stable', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/GDI-STM_boost.kicad_sch', 'utf8');
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
  assert.equal(findSymbolText(driver, 'VCC', 'pin-name')?.baseline, 'ideographic');
  assert.equal(findSymbolText(driver, 'COM', 'pin-name')?.angle, 270);
  assert.equal(findSymbolText(driver, 'COM', 'pin-name')?.baseline, 'hanging');
  const driverGeometry = imported.document.components.find(
    component => component.importedReference === 'U24'
  )?.importedGeometry;
  const driverReference = findTextByRole(driverGeometry?.primitives, 'reference');
  const driverValue = findTextByRole(driverGeometry?.primitives, 'value');
  assert.ok(driverGeometry && driverReference && driverValue);
  assert.ok(
    Math.abs((driverReference?.at.y ?? 0) - (driverGeometry?.bounds.minY ?? 0)) <= 2.6,
    'expected GDI driver reference to stay close to the top body edge'
  );
  assert.ok(
    Math.abs((driverValue?.at.y ?? 0) - (driverGeometry?.bounds.minY ?? 0)) <= 0.2,
    'expected GDI driver value to stay tucked to the top body edge like KiCad'
  );

  assert.equal(findSymbolText(protectionDiode, 'D32', 'reference')?.textAnchor, 'middle');
  assert.equal(findSymbolText(protectionDiode, 'STTH802G-TR', 'value')?.textAnchor, 'middle');
  assert.ok(
    (protectionDiode?.primitives.filter(primitive => primitive.kind === 'circle').length ?? 0) >= 1,
    'expected boost protection diode to preserve its native circular body detail'
  );

  assert.equal(findSymbolText(bulkCap, 'C116', 'reference')?.textAnchor, 'start');
  assert.equal(findSymbolText(bulkCap, '2200uF/50V', 'value')?.textAnchor, 'start');
  assert.ok(
    (bulkCap?.primitives.filter(primitive => primitive.kind === 'arc').length ?? 0) >= 1,
    'expected polarized capacitor to preserve its curved native plate primitive'
  );
});

test('L9779WD-breakout_adc keeps multi-unit op-amp, resistor network, and TVS text geometry stable', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/L9779WD-breakout_adc.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const symbols = imported.document.importedSchematicScene?.symbols ?? [];

  const u35Units = symbols.filter(symbol => symbol.reference === 'U35');
  const u46Units = symbols.filter(symbol => symbol.reference === 'U46');
  const rn3 = symbols.find(symbol => symbol.reference === 'RN3');
  const d38 = symbols.find(symbol => symbol.reference === 'D38');
  const d40 = symbols.find(symbol => symbol.reference === 'D40');

  assert.ok(u35Units.length >= 5, 'expected MCP6004 U35 to preserve all visible multi-unit scene symbols');
  assert.ok(u46Units.length >= 5, 'expected MCP6004 U46 to preserve all visible multi-unit scene symbols');
  assert.ok(rn3);
  assert.ok(d38);
  assert.ok(d40);

  for (const symbol of [...u35Units.slice(0, 4), ...u46Units.slice(0, 4)]) {
    assert.equal(
      symbol.primitives.filter(primitive => primitive.kind === 'polyline').length,
      4,
      'expected op-amp triangle units to keep their native polyline count'
    );
    assert.equal(
      symbol.primitives.filter(primitive => primitive.kind === 'text').length,
      2,
      'expected individual op-amp units to keep compact native reference/value text only'
    );
  }

  const u35PowerUnit = u35Units.find(symbol => symbol.pinAnchors.length === 2);
  const u46PowerUnit = u46Units.find(symbol => symbol.pinAnchors.length === 2);
  assert.ok(u35PowerUnit, 'expected U35 power unit to survive as its own scene symbol');
  assert.ok(u46PowerUnit, 'expected U46 power unit to survive as its own scene symbol');
  assert.ok(
    (u35PowerUnit?.primitives.filter(primitive => primitive.kind === 'rect').length ?? 0) >= 1,
    'expected U35 power unit to keep its native rectangular power body'
  );
  assert.ok(
    (u46PowerUnit?.primitives.filter(primitive => primitive.kind === 'rect').length ?? 0) >= 1,
    'expected U46 power unit to keep its native rectangular power body'
  );

  assert.equal(findSymbolText(rn3, 'RN3', 'reference')?.angle, 90);
  assert.equal(findSymbolText(rn3, '10k', 'value')?.angle, 90);
  assert.equal(findSymbolText(d38, 'D38', 'reference')?.angle, 90);
  assert.equal(findSymbolText(d38, 'SRV05-4', 'value')?.angle, 90);
  assert.equal(findSymbolText(d40, 'D40', 'reference')?.angle, 90);
  assert.equal(findSymbolText(d40, 'SRV05-4', 'value')?.angle, 90);
  const d38Geometry = imported.document.components.find(
    component => component.importedReference === 'D38'
  )?.importedGeometry;
  const d40Geometry = imported.document.components.find(
    component => component.importedReference === 'D40'
  )?.importedGeometry;
  const d38Reference = findTextByRole(d38Geometry?.primitives, 'reference');
  const d38Value = findTextByRole(d38Geometry?.primitives, 'value');
  const d40Reference = findTextByRole(d40Geometry?.primitives, 'reference');
  const d40Value = findTextByRole(d40Geometry?.primitives, 'value');
  assert.ok(d38Geometry && d38Reference && d38Value && d40Geometry && d40Reference && d40Value);
  assert.ok(
    Math.abs((d38Reference?.at.x ?? 0) - (d38Geometry?.bounds.minX ?? 0)) <= 5.6,
    'expected D38 reference to stay near the left body edge instead of drifting too far outward'
  );
  assert.ok(
    Math.abs((d38Value?.at.x ?? 0) - (d38Geometry?.bounds.minX ?? 0)) <= 3.2,
    'expected D38 value to stay near the left body edge instead of drifting too far outward'
  );
  assert.ok(
    Math.abs((d40Reference?.at.x ?? 0) - (d40Geometry?.bounds.minX ?? 0)) <= 5.6,
    'expected D40 reference to stay near the left body edge instead of drifting too far outward'
  );
  assert.ok(
    Math.abs((d40Value?.at.x ?? 0) - (d40Geometry?.bounds.minX ?? 0)) <= 3.2,
    'expected D40 value to stay near the left body edge instead of drifting too far outward'
  );
});

test('transmier preserves KiCad VCC/GND label anchors and capacitor property text', async () => {
  const source = await readFile('/Users/gimdong-il/Downloads/KICAD-main/transmier circuit/transmier.kicad_sch', 'utf8');
  const imported = importKiCadSchematic(source);
  const scene = imported.document.importedSchematicScene;
  const symbols = scene?.symbols ?? [];

  assert.ok(scene);

  const verticalVccLabels = scene?.labels.filter(
    label => label.text === 'VCC' && label.angle === 90
  ) ?? [];
  assert.equal(verticalVccLabels.length, 2);
  assert.ok(
    verticalVccLabels.every(
      label => label.textAnchor === 'start' && label.baseline === 'ideographic'
    ),
    'expected VCC local labels to keep KiCad left/bottom justification'
  );
  assert.ok(
    verticalVccLabels.every(label => {
      const display = getImportedNetLabelDisplay(label);
      return (
        display.angle === label.angle &&
        display.textAnchor === label.textAnchor &&
        display.baseline === label.baseline &&
        display.x === label.at.x &&
        display.y === label.at.y
      );
    }),
    'expected VCC local labels to preserve KiCad source anchors in original rendering'
  );
  const crowdedJ1VccLabel = verticalVccLabels.find(label => label.at.x > 1400);
  assert.ok(crowdedJ1VccLabel);
  const crowdedJ1VccDisplay = getImportedNetLabelDisplay({ ...crowdedJ1VccLabel, side: 'left' });
  assert.equal(crowdedJ1VccDisplay.textAnchor, crowdedJ1VccLabel.textAnchor);
  assert.equal(crowdedJ1VccDisplay.x, crowdedJ1VccLabel.at.x);

  const horizontalGndLabel = scene?.labels.find(
    label => label.text === 'GND' && label.angle === 0
  );
  assert.ok(horizontalGndLabel);
  const horizontalGndDisplay = getImportedNetLabelDisplay(horizontalGndLabel);
  assert.equal(horizontalGndDisplay.angle, 0);
  assert.equal(horizontalGndDisplay.baseline, horizontalGndLabel.baseline);
  assert.equal(horizontalGndDisplay.x, horizontalGndLabel.at.x);
  assert.equal(horizontalGndDisplay.y, horizontalGndLabel.at.y);

  for (const reference of ['C1', 'C2'] as const) {
    const capacitor = symbols.find(symbol => symbol.reference === reference);
    const referenceText = findSymbolText(capacitor, reference, 'reference');
    const valueText = findSymbolText(capacitor, reference === 'C1' ? '0.1uf' : '0.1uF', 'value');

    assert.ok(capacitor, `expected ${reference} to exist`);
    assert.ok(referenceText, `expected ${reference} reference text to survive`);
    assert.ok(valueText, `expected ${reference} value text to survive`);
    assert.equal(valueText?.angle, 90);
    assert.equal(valueText?.originalAngle, 90);
    assert.equal(valueText?.preserveNativeOrientation, true);
    assert.equal(valueText?.textAnchor, 'middle');
    const shapePoints = capacitor.primitives
      .filter((primitive): primitive is Extract<ImportedSchematicPrimitive, { kind: 'polyline' }> => primitive.kind === 'polyline')
      .flatMap(primitive => primitive.points);
    assert.ok(shapePoints.length > 0, `expected ${reference} to have visible capacitor body lines`);
    assert.ok(
      referenceText.angle === 90 && valueText.angle === 90,
      `expected ${reference} property text to preserve the vertical source orientation`
    );
    assert.ok(
      valueText.at.x >= Math.min(...shapePoints.map(point => point.x)) - 2 &&
        valueText.at.x <= Math.max(...shapePoints.map(point => point.x)) + 18,
      `expected ${reference} value text to stay near the source capacitor position`
    );
  }

  for (const reference of ['C3', 'C5'] as const) {
    const capacitor = symbols.find(symbol => symbol.reference === reference);
    const valueText = findSymbolText(capacitor, reference === 'C3' ? '0.01uF' : '4.7uF', 'value');

    assert.ok(capacitor, `expected ${reference} to exist`);
    assert.ok(valueText, `expected ${reference} value text to survive`);
    assert.equal(valueText?.angle, 0);
    assert.equal(valueText?.textAnchor, 'end');
  }

  const terminal = imported.document.components.find(component => component.importedReference === 'J1');
  assert.ok(terminal, 'expected terminal block to exist');
  const importedValuesByReference = new Map(
    imported.document.components.map(component => [component.importedReference, component.value])
  );
  assert.equal(importedValuesByReference.get('C1'), '0.1uf');
  assert.equal(importedValuesByReference.get('C2'), '0.1uF');
  assert.equal(importedValuesByReference.get('R1'), '10k');
  assert.equal(importedValuesByReference.get('J1'), 'OSTTC020162');
  assert.deepEqual(
    terminal?.importedGeometry?.pinAnchors.map(pin => `${pin.pinId}:${pin.number}`),
    ['1:1', '2:2'],
    'expected unnamed KiCad terminal pins to use stable numeric pin IDs'
  );

  const customTemplates = new Map(
    (imported.document.customComponentPackages ?? []).map(pkg => [
      pkg.templateId,
      customComponentPackageToTemplate(pkg),
    ])
  );
  const resolveTemplate = (templateId: string) => getStaticTemplateById(templateId) ?? customTemplates.get(templateId);
  const circuitReport = analyzeCircuitNetlist(
    imported.document.components,
    imported.document.activeBoardId,
    resolveTemplate,
    imported.document.manualConnections ?? []
  );
  const componentById = new Map(imported.document.components.map(component => [component.instanceId, component]));
  const capacitorByReference = new Map(
    (circuitReport.capacitors ?? []).map(capacitor => [
      componentById.get(capacitor.componentId)?.importedReference,
      capacitor,
    ])
  );
  const assertCloseFarads = (actual: number | undefined, expected: number) => {
    assert.equal(typeof actual, 'number');
    assert.ok(Math.abs((actual ?? 0) - expected) <= expected * 1e-9);
  };

  assert.equal(capacitorByReference.get('C1')?.value, '0.1uf');
  assertCloseFarads(capacitorByReference.get('C1')?.capacitanceFarads, 0.1e-6);
  assert.equal(capacitorByReference.get('C2')?.value, '0.1uF');
  assertCloseFarads(capacitorByReference.get('C2')?.capacitanceFarads, 0.1e-6);

  const labeledNets = circuitReport.nets.filter(net => net.sourceLabels.length > 0);
  assert.ok(labeledNets.some(net => net.sourceLabels.includes('VCC') && !net.sourceLabels.includes('GND')));
  assert.ok(labeledNets.some(net => net.sourceLabels.includes('GND') && !net.sourceLabels.includes('VCC')));
  assert.equal(
    circuitReport.issues.some(issue => issue.ruleId === 'electrical.pinout-mismatch'),
    false,
    'expected Central 2N2222A TO-18 pinout to match the imported symbol'
  );
  assert.equal(
    circuitReport.issues.some(issue => issue.ruleId === 'netlist.solver-convergence'),
    false,
    'expected labeled GND to give the DC solver a stable reference'
  );
  assert.deepEqual(
    circuitReport.issues
      .filter(issue => issue.ruleId === 'electrical.symbol-footprint-family-mismatch')
      .map(issue => issue.componentName)
      .sort(),
    ['Microphone', 'OSTTC020162']
  );
});

test('real KiCad fixtures keep representative pin anchors visually attached to imported wires', async () => {
  const cases = [
    {
      filePath: '/Users/gimdong-il/Downloads/KICAD-main/Arduino hat/Arduino_hat.kicad_sch',
      symbolReference: 'D1',
      expectedPins: ['K', 'A'],
    },
    {
      filePath: '/Users/gimdong-il/Downloads/KICAD-main/rasphat_proj2/rasphat_proj2.kicad_sch',
      symbolReference: 'U1',
      expectedPins: ['VDD', 'DATA', 'GND'],
    },
    {
      filePath: '/Users/gimdong-il/Downloads/KICAD-main/Flamingo cotnrol project/Flamingo p.kicad_sch',
      symbolReference: 'U2',
      expectedPins: ['PROG', 'BAT', 'VCC'],
    },
    {
      filePath: '/Users/gimdong-il/Downloads/KICAD-main/MATRIX PROJECT/MATRIX PROJECT.kicad_sch',
      symbolReference: 'J1',
      expectedPins: ['Pin_1', 'Pin_4', 'Pin_8'],
    },
    {
      filePath: '/Users/gimdong-il/Downloads/KICAD-main/Breadboard-powersupply/P_supply.kicad_sch',
      symbolReference: 'D2',
      expectedPins: ['K', 'A'],
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
        candidate => candidate.label === pinLabel || candidate.number === pinLabel
      );
      assert.ok(anchor, `expected ${fixture.symbolReference} pin ${pinLabel} to exist`);
      assert.ok(
        hasSceneWireAttachment(scene!, anchor!.at),
        `expected ${fixture.symbolReference} pin ${pinLabel} to stay visually attached to a wire`
      );
    }
  }
});
