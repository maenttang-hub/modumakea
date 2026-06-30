import test from 'node:test';
import assert from 'node:assert/strict';

import { buildKiCadSchematic } from '@/lib/export-kicad';
import { layoutImportedGeometry } from '@/lib/imported-schematic-geometry';
import { importKiCadSchematic } from '@/lib/kicad-sch-parser';
import { setRuntimeCustomComponentPackages } from '@/lib/custom-component-registry';
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

function installBrowserMocks() {
  const store = new Map<string, string>();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string) {
        store.set(key, String(value));
      },
      removeItem(key: string) {
        store.delete(key);
      },
      clear() {
        store.clear();
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      get length() {
        return store.size;
      },
    },
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: globalThis,
  });
}

installBrowserMocks();

const { useBoardStore } = await import('@/store/use-board-store');

function replaceWireSection(schematic: string, wireSection: string) {
  return schematic.replace(
    /\n  \(wire[\s\S]*?\n  \(sheet_instances/,
    `\n${wireSection}\n  (sheet_instances`
  );
}

test('importKiCadSchematic keeps generated ModuMake board schematics parseable during native KiCad normalization', () => {
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
    '    (pts (xy 10.62 41.22) (xy 71.46 41.22))',
    '    (stroke (width 0) (type default))',
    '    (uuid "wire-vcc")',
    '  )',
    '  (wire',
    '    (pts (xy 10.62 36.18) (xy 71.46 38.7))',
    '    (stroke (width 0) (type default))',
    '    (uuid "wire-gnd")',
    '  )',
    '  (wire',
    '    (pts (xy 36.18 56.52) (xy 71.46 36.18))',
    '    (stroke (width 0) (type default))',
    '    (uuid "wire-data")',
    '  )',
  ].join('\n'));

  const result = importKiCadSchematic(schematic, { projectName: 'greenhouse helper' });
  const component = result.document.components[0];

  assert.equal(result.summary.boardId, 'uno');
  assert.equal(result.summary.importedComponentCount, 1);
  assert.equal(result.document.importedSchematicSource, schematic);
  assert.ok(result.document.importedSchematicScene);
  assert.equal(result.document.importedSchematicScene?.wireSegments.length, 3);
  assert.equal(component?.templateId, 'tpl_dht11');
  assert.equal(component?.importedGeometry?.pinAnchors.length, 3);
  assert.ok(component?.importedReference);

  const hydrated = useBoardStore.getState().hydrateProject(result.document);
  assert.equal(hydrated.success, true);
});

test('importKiCadSchematic rejects legacy or unsupported KiCad formats before parsing', () => {
  assert.throws(
    () => importKiCadSchematic('(kicad_doc (version 20211014))'),
    /구버전 KiCad 파일이거나 지원되지 않는 포맷/
  );
});

test('importKiCadSchematic keeps generated ModuMake component-to-component schematics parseable', () => {
  const schematic = buildKiCadSchematic({
    projectName: 'led chain',
    activeBoardId: 'uno',
    components: [
      {
        instanceId: 'res-1',
        templateId: 'tpl_resistor',
        name: '저항 1',
        value: '220 Ohm',
        position: { x: 420, y: 180 },
        rotation: 0,
        assignedPins: { '1': 'D2' },
        isFullyRouted: true,
      },
      {
        instanceId: 'led-1',
        templateId: 'tpl_led',
        name: 'LED 1',
        value: 'green',
        position: { x: 620, y: 180 },
        rotation: 0,
        assignedPins: { GND: 'GND' },
        isFullyRouted: true,
      },
    ],
    manualConnections: [
      {
        id: 'signal-link',
        source: { ownerType: 'component', ownerId: 'res-1', pinId: '2' },
        target: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
      },
    ],
  });

  const result = importKiCadSchematic(schematic, { projectName: 'led chain' });
  const resistor = result.document.components.find(component => component.templateId === 'tpl_resistor');
  const led = result.document.components.find(component => component.templateId === 'tpl_led');

  assert.ok(resistor);
  assert.ok(led);
  assert.ok(Array.isArray(result.document.manualConnections));
  assert.ok(result.document.importedSchematicScene);
  assert.ok((resistor.importedGeometry?.pinAnchors.length ?? 0) >= 2);
  assert.ok((led.importedGeometry?.pinAnchors.length ?? 0) >= 2);
});

test('importKiCadSchematic keeps unmapped MCU schematics in a neutral imported-board context', () => {
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

  const result = importKiCadSchematic(schematic, { projectName: 'custom mcu' });
  const imported = result.document.components[0];

  assert.equal(result.summary.boardId, 'kicad_generic');
  assert.equal(result.document.activeBoardId, 'kicad_generic');
  assert.ok(imported);
  assert.equal(imported?.name, 'ATmega328P-PU');
  assert.deepEqual(imported?.assignedPins, {});
  assert.ok(imported?.importedGeometry, 'imported KiCad symbol geometry should be preserved');
  assert.equal(imported?.importedReference, 'U1');
  assert.ok((imported?.importedGeometry?.pinAnchors.length ?? 0) >= 2);
  assert.ok(
    imported?.importedGeometry?.primitives.some(
      primitive => primitive.kind === 'text' && primitive.role === 'reference' && primitive.text === 'U1'
    )
  );
  assert.ok(
    imported?.importedGeometry?.primitives.some(
      primitive => primitive.kind === 'text' && primitive.role === 'value' && primitive.text === 'ATmega328P-PU'
    )
  );
  assert.ok(
    result.document.importedSchematicScene?.symbols?.some(
      symbol =>
        symbol.instanceId === imported?.instanceId &&
        symbol.reference === 'U1' &&
        symbol.primitives.length > 0
    ),
    'expected imported schematic scene to include an MCU symbol snapshot'
  );
  assert.equal(imported?.importedMapping?.source, 'custom-fallback');
  assert.equal(result.summary.fallbackComponentCount, 1);
  assert.equal(result.summary.lowConfidenceComponentCount, 1);
});

test('importKiCadSchematic maps unknown resistor symbols through RefDes heuristics', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Vendor:OddResistor"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "10k" (id 1) (at 0 -2.54 0))
      (symbol "OddResistor_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 0 180) (length 2.54)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Vendor:OddResistor")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 50.8 45.72 0))
    (property "Value" "10k" (id 1) (at 50.8 55.88 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'odd resistor' });
  const imported = result.document.components[0];

  assert.ok(imported);
  assert.equal(imported?.templateId, 'tpl_resistor');
  assert.equal(imported?.importedMapping?.source, 'refdes');
  assert.equal(imported?.importedMapping?.confidence, 'high');
});

test('imported wire coordinates align with imported component pin anchors in canvas space', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Sensor:DHT22"
      (property "Reference" "U" (id 0) (at 0 0 0))
      (property "Value" "DHT22" (id 1) (at 0 -2.54 0))
      (symbol "DHT22_1_1"
        (rectangle (start -5.08 -5.08) (end 5.08 5.08) (stroke (width 0)) (fill (type none)))
        (pin power_in line (at -7.62 -2.54 0) (length 2.54)
          (name "VDD" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin input line (at -7.62 0 0) (length 2.54)
          (name "DATA" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Sensor:DHT22")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "sensor-1")
    (property "Reference" "U1" (id 0) (at 50.8 44.45 0))
    (property "Value" "DHT22" (id 1) (at 50.8 57.15 0))
  )
  (wire
    (pts (xy 43.18 50.8) (xy 30.48 50.8))
    (stroke (width 0) (type default))
    (uuid "wire-data")
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'alignment-check' });
  const imported = result.document.components[0];
  const layout = imported?.importedGeometry
    ? layoutImportedGeometry(imported.importedGeometry, imported.rotation)
    : null;
  const dataAnchor = layout?.pinAnchors.find(anchor => anchor.label === 'DATA');
  const segment = result.document.importedSchematicScene?.wireSegments[0];

  assert.ok(imported);
  assert.ok(layout);
  assert.ok(dataAnchor);
  assert.ok(segment);

  const anchorX = imported!.position.x + dataAnchor!.at.x;
  const anchorY = imported!.position.y + dataAnchor!.at.y;

  assert.ok(Math.abs(anchorX - segment!.start.x) <= 0.5);
  assert.ok(Math.abs(anchorY - segment!.start.y) <= 0.5);
});

test('small imported sensors do not get noisy MCU-style pin text overlays', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Sensor:DHT22"
      (property "Reference" "U" (id 0) (at 0 0 0))
      (property "Value" "DHT22" (id 1) (at 0 -2.54 0))
      (symbol "DHT22_1_1"
        (rectangle (start -5.08 -5.08) (end 5.08 5.08) (stroke (width 0)) (fill (type none)))
        (pin power_in line (at -7.62 -2.54 0) (length 2.54)
          (name "VDD" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin input line (at -7.62 0 0) (length 2.54)
          (name "DATA" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
        (pin no_connect line (at -7.62 2.54 0) (length 2.54)
          (name "NC" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.27 1.27))))
        )
        (pin power_in line (at 0 7.62 270) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "4" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Sensor:DHT22")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "sensor-quiet")
    (property "Reference" "U1" (id 0) (at 50.8 44.45 0))
    (property "Value" "DHT22" (id 1) (at 50.8 57.15 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'quiet dht22' });
  const imported = result.document.components[0];
  const textPrimitives = imported?.importedGeometry?.primitives.filter(
    primitive => primitive.kind === 'text'
  ) ?? [];

  assert.ok(imported);
  assert.equal(imported?.templateId, 'tpl_dht22');
  assert.equal(
    textPrimitives.some(
      primitive => primitive.role === 'pin-name' || primitive.role === 'pin-number'
    ),
    false
  );
  assert.equal(
    textPrimitives.some(primitive => primitive.role === 'reference' && primitive.text === 'U1'),
    true
  );
  assert.equal(
    textPrimitives.some(primitive => primitive.role === 'value' && primitive.text === 'DHT22'),
    true
  );
});

test('layoutImportedGeometry keeps symbol placement anchored to body primitives even when text extends far away', () => {
  const layout = layoutImportedGeometry({
    bounds: { minX: -5.08, minY: -5.08, maxX: 5.08, maxY: 5.08 },
    renderSource: 'primitive',
    pinRenderMode: 'primitive',
    primitives: [
      {
        kind: 'rect',
        start: { x: -5.08, y: -5.08 },
        end: { x: 5.08, y: 5.08 },
      },
      {
        kind: 'text',
        at: { x: 34, y: 0 },
        text: 'Far annotation',
        angle: 0,
        sizeMm: 1.27,
        role: 'annotation',
      },
    ],
    pinAnchors: [
      {
        pinId: 'LEFT',
        label: 'LEFT',
        number: '1',
        at: { x: -5.08, y: 0 },
        angle: 180,
        lengthMm: 2.54,
      },
    ],
  }, 0);

  assert.ok(layout.pinAnchors[0]);
  assert.equal(Math.round(layout.pinAnchors[0]!.at.x), 0);
  assert.ok(layout.width < 120);
});

test('importKiCadSchematic preserves root-level KiCad symbol graphics for passive parts', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Vendor:RootCap"
      (property "Reference" "C" (id 0) (at 0 0 0))
      (property "Value" "10uF" (id 1) (at 0 -2.54 0))
      (polyline
        (pts (xy -5.08 0) (xy -1.27 0))
      )
      (polyline
        (pts (xy -1.27 -4) (xy -1.27 4))
      )
      (polyline
        (pts (xy 1.27 -4) (xy 1.27 4))
      )
      (polyline
        (pts (xy 1.27 0) (xy 5.08 0))
      )
      (symbol "RootCap_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 0 180) (length 2.54)
          (name "2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Vendor:RootCap")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "c-1")
    (property "Reference" "C1" (id 0) (at 50.8 45.72 0))
    (property "Value" "10uF" (id 1) (at 50.8 55.88 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'root cap' });
  const imported = result.document.components[0];

  assert.ok(imported);
  assert.equal(imported?.templateId, 'tpl_capacitor');
  assert.ok(imported?.importedGeometry?.primitives.some(primitive => primitive.kind === 'polyline'));
  assert.equal(imported?.importedGeometry?.renderSource, 'primitive');
  assert.equal(
    imported?.importedGeometry?.primitives.some(
      primitive =>
        primitive.kind === 'rect' &&
        primitive.start.x === -10.16 &&
        primitive.end.x === 10.16
    ),
    false
  );
});

test('importKiCadSchematic resolves KiCad symbol inheritance for derived connector graphics and pins', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Connector:BaseConn"
      (property "Reference" "J" (id 0) (at 0 0 0))
      (property "Value" "BaseConn" (id 1) (at 0 -2.54 0))
      (rectangle
        (start -5.08 -3.81)
        (end 5.08 3.81)
        (stroke (width 0) (type default))
        (fill (type none))
      )
      (symbol "BaseConn_1_1"
        (pin passive line (at -7.62 0 0) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 7.62 0 180) (length 2.54)
          (name "2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
    (symbol "Connector:DerivedConn"
      (extends "BaseConn")
      (property "Reference" "J" (id 0) (at 0 0 0))
      (property "Value" "DerivedConn" (id 1) (at 0 -2.54 0))
      (text "DERIVED" (at 0 6.35 0)
        (effects (font (size 1.27 1.27)))
      )
    )
  )
  (symbol
    (lib_id "Connector:DerivedConn")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "derived-conn-1")
    (property "Reference" "J1" (id 0) (at 50.8 45.72 0))
    (property "Value" "DerivedConn" (id 1) (at 50.8 55.88 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'derived connector' });
  const imported = result.document.components[0];
  const pinOne = imported?.importedGeometry?.pinAnchors.find(pin => pin.number === '1');
  const pinTwo = imported?.importedGeometry?.pinAnchors.find(pin => pin.number === '2');
  const hasBaseRect = imported?.importedGeometry?.primitives.some(
    primitive =>
      primitive.kind === 'rect' &&
      primitive.start.x === -5.08 &&
      primitive.start.y === 3.81 &&
      primitive.end.x === 5.08 &&
      primitive.end.y === -3.81
  );
  const inheritedLabel = imported?.importedGeometry?.primitives.find(
    primitive => primitive.kind === 'text' && primitive.text === 'DERIVED'
  );
  const sceneSymbol = result.document.importedSchematicScene?.symbols?.find(
    symbol => symbol.instanceId === imported?.instanceId
  );

  assert.ok(imported);
  assert.equal(imported?.importedGeometry?.renderSource, 'primitive');
  assert.ok(hasBaseRect, 'expected inherited base body primitive to be preserved');
  assert.ok(pinOne);
  assert.ok(pinTwo);
  assert.equal(pinOne?.at.x, -7.62);
  assert.equal(pinTwo?.at.x, 7.62);
  assert.ok(inheritedLabel, 'expected derived symbol annotation text to remain after inheritance');
  assert.ok(sceneSymbol, 'expected derived connector to appear in imported scene symbols');
  assert.ok(
    sceneSymbol?.primitives.some(
      primitive => primitive.kind === 'text' && primitive.text === 'DERIVED'
    ),
    'expected scene symbol snapshot to keep inherited connector text'
  );
  assert.equal(
    sceneSymbol?.primitives.filter(
      primitive => primitive.kind === 'text' && primitive.role === 'pin-number'
    ).length,
    2,
    'expected connector pin numbers to render once without generated duplicates'
  );
});

test('importKiCadSchematic parses KiCad polygon primitives as closed filled polylines', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Graphic:FlagWithPolygon"
      (property "Reference" "U" (id 0) (at 0 0 0))
      (property "Value" "FlagWithPolygon" (id 1) (at 0 -2.54 0))
      (polygon
        (pts
          (xy 0 0)
          (xy 2.54 1.27)
          (xy 0 2.54)
        )
        (stroke (width 0) (type default))
        (fill (type background))
      )
      (symbol "FlagWithPolygon_1_1"
        (pin power_in line (at 0 -2.54 90) (length 2.54)
          (name "pwr" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Graphic:FlagWithPolygon")
    (at 25.4 25.4 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "polygon-flag-1")
    (property "Reference" "U1" (id 0) (at 25.4 20.32 0))
    (property "Value" "FlagWithPolygon" (id 1) (at 25.4 30.48 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'polygon primitive' });
  const imported = result.document.components[0];
  const polygonPrimitive = imported?.importedGeometry?.primitives.find(
    primitive => primitive.kind === 'polyline' && primitive.fill === 'background'
  );

  assert.ok(imported);
  assert.equal(imported?.importedGeometry?.renderSource, 'primitive');
  assert.ok(polygonPrimitive && polygonPrimitive.kind === 'polyline');
  if (polygonPrimitive?.kind === 'polyline') {
    assert.deepEqual(
      polygonPrimitive.points.map(point => ({
        x: Number(point.x.toFixed(2)),
        y: Number(point.y.toFixed(2)),
      })),
      [
        { x: 0, y: 0 },
        { x: 2.54, y: -1.27 },
        { x: 0, y: -2.54 },
        { x: 0, y: 0 },
      ]
    );
  }
});

test('importKiCadSchematic parses KiCad circles with numeric radii away from the origin', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Vendor:NumericCircle"
      (property "Reference" "TP" (id 0) (at 0 0 0))
      (property "Value" "TP" (id 1) (at 0 -2.54 0))
      (circle
        (center 10 5)
        (radius 1.27)
        (stroke (width 0) (type default))
        (fill (type none))
      )
      (symbol "NumericCircle_1_1"
        (pin passive line (at 10 2.46 270) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Vendor:NumericCircle")
    (at 30 30 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "circle-1")
    (property "Reference" "TP1" (id 0) (at 30 26 0))
    (property "Value" "TP" (id 1) (at 30 34 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'numeric circle' });
  const imported = result.document.components[0];
  const circle = imported?.importedGeometry?.primitives.find(
    primitive => primitive.kind === 'circle'
  );

  assert.ok(imported);
  assert.ok(circle && circle.kind === 'circle');
  if (circle?.kind === 'circle') {
    assert.equal(Number(circle.center.x.toFixed(2)), 10);
    assert.equal(Number(circle.center.y.toFixed(2)), -5);
    assert.equal(Number(circle.radius.toFixed(2)), 1.27);
  }
});

test('importKiCadSchematic resolves extends bases even when library prefixes differ', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "GND"
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "GND" (id 1) (at 0 -2.54 0))
      (polyline
        (pts (xy 0 0) (xy 0 2.54))
      )
      (symbol "GND_1_1"
        (pin power_in line (at 0 -2.54 90) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
      )
    )
    (symbol "power:GND"
      (extends "power:GND")
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "GND" (id 1) (at 0 -2.54 0))
    )
  )
  (symbol
    (lib_id "power:GND")
    (at 20 20 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "gnd-1")
    (property "Reference" "#PWR0101" (id 0) (at 20 16 0))
    (property "Value" "GND" (id 1) (at 20 24 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'fuzzy extends' });
  const imported = result.document.components[0];

  assert.ok(imported);
  assert.equal(imported?.importedGeometry?.renderSource, 'primitive');
  assert.ok(
    imported?.importedGeometry?.primitives.some(
      primitive => primitive.kind === 'polyline'
    ),
    'expected fuzzy extends resolution to preserve base symbol primitives'
  );
});

test('importKiCadSchematic resolves instance library symbols even when prefixes differ', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Connector_Generic:Conn_01x02"
      (property "Reference" "J" (id 0) (at 0 0 0))
      (property "Value" "Conn_01x02" (id 1) (at 0 -2.54 0))
      (rectangle
        (start -5.08 -2.54)
        (end 5.08 2.54)
        (stroke (width 0) (type default))
        (fill (type none))
      )
      (symbol "Conn_01x02_1_1"
        (pin passive line (at -7.62 0 0) (length 2.54)
          (name "Pin_1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 7.62 0 180) (length 2.54)
          (name "Pin_2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Conn_01x02")
    (at 40 40 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "conn-1")
    (property "Reference" "J1" (id 0) (at 40 36 0))
    (property "Value" "Conn_01x02" (id 1) (at 40 44 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'fuzzy instance symbol' });
  const imported = result.document.components[0];

  assert.ok(imported);
  assert.equal(imported?.importedGeometry?.renderSource, 'primitive');
  assert.ok(
    imported?.importedGeometry?.primitives.some(
      primitive => primitive.kind === 'rect'
    ),
    'expected prefix-insensitive symbol lookup to preserve original connector body'
  );
});

test('importKiCadSchematic preserves KiCad background fill for IC body primitives', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "MCU_Test:FilledMcu"
      (property "Reference" "U" (id 0) (at 0 -10 0))
      (property "Value" "FilledMcu" (id 1) (at 0 10 0))
      (rectangle (start -5 -8) (end 5 8) (stroke (width 0) (type default)) (fill (type background)))
      (symbol "FilledMcu_1_1"
        (pin input line (at -7 0 0) (length 2.54)
          (name "GPIO" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin power_in line (at 0 -10 90) (length 2.54)
          (name "VCC" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "MCU_Test:FilledMcu")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "u-1")
    (property "Reference" "U1" (id 0) (at 50.8 40 0))
    (property "Value" "FilledMcu" (id 1) (at 50.8 62 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'filled mcu' });
  const imported = result.document.components[0];
  const bodyRect = imported?.importedGeometry?.primitives.find(
    primitive => primitive.kind === 'rect' && primitive.fill === 'background'
  );

  assert.ok(imported);
  assert.equal(imported?.importedGeometry?.renderSource, 'primitive');
  assert.ok(bodyRect, 'expected the imported IC body to keep KiCad background fill');
});

test('importKiCadSchematic preserves original library text primitives when a symbol provides them', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Vendor:TextyLed"
      (property "Reference" "D" (id 0) (at 0 0 0))
      (property "Value" "LED" (id 1) (at 0 -2.54 0))
      (polyline
        (pts (xy -5 0) (xy -1 0))
      )
      (polyline
        (pts (xy -1 -3) (xy 3 0) (xy -1 3) (xy -1 -3))
      )
      (polyline
        (pts (xy 3 -3.5) (xy 3 3.5))
      )
      (text "A" (at -6 0 0) (effects (font (size 1 1))))
      (text "K" (at 4.5 0 0) (effects (font (size 1 1))))
      (symbol "TextyLed_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "A" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 0 180) (length 2.54)
          (name "K" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Vendor:TextyLed")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "d-1")
    (property "Reference" "D1" (id 0) (at 50.8 45.72 0))
    (property "Value" "LED" (id 1) (at 50.8 55.88 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'texty led' });
  const imported = result.document.components[0];
  const annotationTexts = filterTextPrimitives(
    imported?.importedGeometry?.primitives,
    primitive => primitive.role === 'annotation'
  );

  assert.ok(imported);
  assert.equal(imported?.importedGeometry?.renderSource, 'primitive');
  assert.deepEqual(
    annotationTexts.map(primitive => primitive.text).sort(),
    ['A', 'K']
  );
});

test('importKiCadSchematic applies KiCad mirror transforms to primitives and pin anchors', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Vendor:MirroredResistor"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "10k" (id 1) (at 0 -2.54 0))
      (text "MIRROR_Y" (at 0 3 0)
        (effects (font (size 1 1)) (justify left top))
      )
      (polyline
        (pts (xy -4 0) (xy 0 0))
      )
      (symbol "MirroredResistor_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 0 180) (length 2.54)
          (name "2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Vendor:MirroredResistor")
    (at 50.8 50.8 0)
    (mirror y)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "mirror-r-1")
    (property "Reference" "R1" (id 0) (at 50.8 45.72 0))
    (property "Value" "10k" (id 1) (at 50.8 55.88 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'mirrored resistor' });
  const imported = result.document.components[0];
  const pinOne = imported?.importedGeometry?.pinAnchors.find(pin => pin.number === '1');
  const pinTwo = imported?.importedGeometry?.pinAnchors.find(pin => pin.number === '2');
  const primitivePolyline = imported?.importedGeometry?.primitives.find(primitive => primitive.kind === 'polyline');
  const mirroredText = findTextPrimitive(
    imported?.importedGeometry?.primitives,
    primitive => primitive.text === 'MIRROR_Y'
  );

  assert.ok(imported);
  assert.ok(pinOne);
  assert.ok(pinTwo);
  assert.ok(primitivePolyline && primitivePolyline.kind === 'polyline');
  assert.equal(pinOne?.at.x, 5.08);
  assert.equal(pinOne?.angle, 180);
  assert.equal(pinTwo?.at.x, -5.08);
  assert.equal(pinTwo?.angle, 0);
  assert.equal(primitivePolyline?.kind, 'polyline');
  if (primitivePolyline?.kind === 'polyline') {
    assert.deepEqual(
      primitivePolyline.points.map(point => ({
        x: Number(point.x.toFixed(3)),
        y: Number(point.y.toFixed(3)),
      })),
      [{ x: 4, y: 0 }, { x: 0, y: 0 }]
    );
  }
  assert.equal(mirroredText?.textAnchor, 'end');
  assert.equal(mirroredText?.baseline, 'ideographic');
});

test('importKiCadSchematic flips text baselines under mirror x without changing horizontal alignment', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Vendor:MirroredText"
      (property "Reference" "U" (id 0) (at 0 0 0)
        (effects (font (size 1.27 1.27)) (justify left top))
      )
      (property "Value" "MirroredText" (id 1) (at 0 -2.54 0))
    )
  )
  (symbol
    (lib_id "Vendor:MirroredText")
    (at 50.8 50.8 0)
    (mirror x)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "mirror-x-1")
    (property "Reference" "U1" (id 0) (at 50.8 45.72 0)
      (effects (font (size 1.27 1.27)) (justify left top))
    )
    (property "Value" "MirroredText" (id 1) (at 50.8 55.88 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'mirrored text x' });
  const symbol = result.document.importedSchematicScene?.symbols?.find(
    item => item.instanceId === 'mirror-x-1'
  );
  const mirroredText = findSceneSymbolText(symbol, primitive => primitive.role === 'reference');

  assert.ok(symbol);
  assert.equal(mirroredText?.textAnchor, 'start');
  assert.equal(mirroredText?.baseline, 'ideographic');
});

test('importKiCadSchematic keeps component pins connected on long wires even with tiny coordinate drift', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Vendor:OddResistor"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "330" (id 1) (at 0 -2.54 0))
      (symbol "OddResistor_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 0 180) (length 2.54)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Vendor:OddResistor")
    (at 105.08 50.800002 90)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 105.08 45.72 0))
    (property "Value" "330" (id 1) (at 105.08 55.88 0))
  )
  (symbol
    (lib_id "Vendor:OddResistor")
    (at 505.08 50.800002 90)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "r-2")
    (property "Reference" "R2" (id 0) (at 505.08 45.72 0))
    (property "Value" "330" (id 1) (at 505.08 55.88 0))
  )
  (wire
    (pts (xy 0 45.72) (xy 1000 45.72))
    (stroke (width 0) (type default))
    (uuid "wire-long")
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'long wire drift' });

  assert.equal(result.document.manualConnections.length, 1);
  assert.deepEqual(result.document.manualConnections[0], {
    id: 'kicad-import-1',
    source: { ownerType: 'component', ownerId: 'r-1', pinId: '2' },
    target: { ownerType: 'component', ownerId: 'r-2', pinId: '2' },
    suggestedNetName: undefined,
  });
});

test('importKiCadSchematic snaps near-identical component points into the same net', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Vendor:OddResistor"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "10k" (id 1) (at 0 -2.54 0))
      (symbol "OddResistor_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 0 180) (length 2.54)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Vendor:OddResistor")
    (at 94.92 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "snap-r-1")
    (property "Reference" "R1" (id 0) (at 94.92 45.72 0))
    (property "Value" "10k" (id 1) (at 94.92 55.88 0))
  )
  (symbol
    (lib_id "Vendor:OddResistor")
    (at 105.086 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "snap-r-2")
    (property "Reference" "R2" (id 0) (at 105.086 45.72 0))
    (property "Value" "10k" (id 1) (at 105.086 55.88 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'snap nearby pins' });

  assert.equal(result.document.manualConnections.length, 1);
  assert.deepEqual(result.document.manualConnections[0], {
    id: 'kicad-import-1',
    source: { ownerType: 'component', ownerId: 'snap-r-1', pinId: '2' },
    target: { ownerType: 'component', ownerId: 'snap-r-2', pinId: '1' },
    suggestedNetName: undefined,
  });
});

test('importKiCadSchematic maps unknown IC symbols through value regex heuristics', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Vendor:UnknownReader"
      (property "Reference" "U" (id 0) (at 0 0 0))
      (property "Value" "MFRC522" (id 1) (at 0 -2.54 0))
      (symbol "UnknownReader_1_1"
        (pin input line (at -5.08 0 0) (length 2.54)
          (name "VCC" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin input line (at -5.08 2.54 0) (length 2.54)
          (name "RST" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
        (pin input line (at -5.08 5.08 0) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.27 1.27))))
        )
        (pin input line (at 5.08 0 180) (length 2.54)
          (name "MISO" (effects (font (size 1.27 1.27))))
          (number "4" (effects (font (size 1.27 1.27))))
        )
        (pin input line (at 5.08 2.54 180) (length 2.54)
          (name "MOSI" (effects (font (size 1.27 1.27))))
          (number "5" (effects (font (size 1.27 1.27))))
        )
        (pin input line (at 5.08 5.08 180) (length 2.54)
          (name "SCK" (effects (font (size 1.27 1.27))))
          (number "6" (effects (font (size 1.27 1.27))))
        )
        (pin input line (at 5.08 7.62 180) (length 2.54)
          (name "SDA" (effects (font (size 1.27 1.27))))
          (number "7" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Vendor:UnknownReader")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "u-1")
    (property "Reference" "U2" (id 0) (at 50.8 45.72 0))
    (property "Value" "MFRC522" (id 1) (at 50.8 55.88 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'unknown reader' });
  const imported = result.document.components[0];

  assert.ok(imported);
  assert.equal(imported?.templateId, 'tpl_rfid_rc522');
  assert.equal(imported?.importedMapping?.source, 'value-regex');
  assert.equal(imported?.importedMapping?.confidence, 'high');
});

test('importKiCadSchematic rejects partial sub-sheet snapshots without lib_symbols', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (symbol
    (lib_id "Device:R")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "sheet-r-1")
    (property "Reference" "R1" (id 0) (at 50.8 45.72 0))
    (property "Value" "10k" (id 1) (at 50.8 55.88 0))
  )
  (sheet
    (at 20 20)
    (size 40 30)
    (property "Sheetname" "child" (id 0) (at 20 16 0))
    (property "Sheetfile" "child.kicad_sch" (id 1) (at 20 52 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  assert.throws(
    () => importKiCadSchematic(schematic, { projectName: 'partial sheet' }),
    /메인 \.kicad_sch 파일을 업로드해 주세요/
  );
});

test('importKiCadSchematic uses schematic-style fallback graphics for capacitors without source graphics', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Vendor:GraphiclessCap"
      (property "Reference" "C" (id 0) (at 0 0 0))
      (property "Value" "100n" (id 1) (at 0 -2.54 0))
      (symbol "GraphiclessCap_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 0 180) (length 2.54)
          (name "2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Vendor:GraphiclessCap")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "c-2")
    (property "Reference" "C2" (id 0) (at 50.8 45.72 0))
    (property "Value" "100n" (id 1) (at 50.8 55.88 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'graphicless cap' });
  const imported = result.document.components[0];
  const polylines = imported?.importedGeometry?.primitives.filter(primitive => primitive.kind === 'polyline') ?? [];

  assert.ok(imported);
  assert.equal(imported?.templateId, 'tpl_capacitor');
  assert.equal(imported?.importedGeometry?.renderSource, 'fallback');
  assert.ok(polylines.length >= 4, 'expected capacitor fallback to emit line primitives instead of a box');
});

test('importKiCadSchematic uses KiCad-style fallback graphics for ground and power flag symbols', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "power:GNDPWR"
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "GNDPWR" (id 1) (at 0 -2.54 0))
      (symbol "GNDPWR_1_1"
        (pin power_in line (at 0 -5.08 270) (length 2.54)
          (name "GNDPWR" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
      )
    )
    (symbol "power:PWR_FLAG"
      (property "Reference" "#FLG" (id 0) (at 0 0 0))
      (property "Value" "PWR_FLAG" (id 1) (at 0 -2.54 0))
      (symbol "PWR_FLAG_1_1"
        (pin power_out line (at 0 5.08 90) (length 2.54)
          (name "pwr" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "power:GNDPWR")
    (at 40 50 0)
    (unit 1)
    (in_bom no)
    (on_board no)
    (uuid "gnd-1")
    (property "Reference" "#PWR01" (id 0) (at 40 44 0))
    (property "Value" "GNDPWR" (id 1) (at 40 54 0))
  )
  (symbol
    (lib_id "power:PWR_FLAG")
    (at 70 50 0)
    (unit 1)
    (in_bom no)
    (on_board no)
    (uuid "flag-1")
    (property "Reference" "#FLG01" (id 0) (at 70 44 0))
    (property "Value" "PWR_FLAG" (id 1) (at 70 54 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'power symbols' });
  const gnd = result.document.components.find(component => component.importedReference === '#PWR01');
  const flag = result.document.components.find(component => component.importedReference === '#FLG01');
  const gndReferenceTexts = filterTextPrimitives(
    gnd?.importedGeometry?.primitives,
    primitive => primitive.role === 'reference'
  );
  const flagReferenceTexts = filterTextPrimitives(
    flag?.importedGeometry?.primitives,
    primitive => primitive.role === 'reference'
  );
  const gndValueTexts = filterTextPrimitives(
    gnd?.importedGeometry?.primitives,
    primitive => primitive.role === 'value'
  );
  const flagValueTexts = filterTextPrimitives(
    flag?.importedGeometry?.primitives,
    primitive => primitive.role === 'value'
  );
  const gndPolylines = gnd?.importedGeometry?.primitives.filter(
    primitive => primitive.kind === 'polyline'
  ) ?? [];
  const flagPolylines = flag?.importedGeometry?.primitives.filter(
    primitive => primitive.kind === 'polyline'
  ) ?? [];

  assert.ok(gndPolylines.length >= 4);
  assert.ok(flagPolylines.length >= 2);
  assert.deepEqual(
    gndPolylines[0]?.points.map(point => ({
      x: Number(point.x.toFixed(1)),
      y: Number(point.y.toFixed(1)),
    })),
    [{ x: 0, y: 0 }, { x: 0, y: 3.6 }]
  );
  assert.deepEqual(
    flagPolylines[0]?.points.map(point => ({
      x: Number(point.x.toFixed(1)),
      y: Number(point.y.toFixed(1)),
    })),
    [{ x: 0, y: 0 }, { x: 0, y: -5.6 }]
  );
  assert.equal(gnd?.importedGeometry?.primitives.some(primitive => primitive.kind === 'rect'), false);
  assert.equal(gndReferenceTexts.length, 0);
  assert.equal(flagReferenceTexts.length, 0);
  assert.equal(gndValueTexts.length, 1);
  assert.equal(flagValueTexts.length, 1);
  assert.equal(gndValueTexts[0]?.text, 'GNDPWR');
  assert.equal(flagValueTexts[0]?.text, 'PWR_FLAG');
});

test('importKiCadSchematic renders generic VCC symbols as quiet external power primitives', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "power:VCC"
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "VCC" (id 1) (at 0 -2.54 0))
      (symbol "VCC_1_1"
        (pin power_out line (at 0 5.08 90) (length 2.54)
          (name "VCC" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "power:VCC")
    (at 55 48 0)
    (unit 1)
    (in_bom no)
    (on_board no)
    (uuid "vcc-1")
    (property "Reference" "#PWR0101" (id 0) (at 55 42 0))
    (property "Value" "VCC" (id 1) (at 55 54 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'vcc cleanup' });
  const vcc = result.document.components[0];
  const referenceTexts = filterTextPrimitives(
    vcc?.importedGeometry?.primitives,
    primitive => primitive.role === 'reference'
  );
  const valueTexts = filterTextPrimitives(
    vcc?.importedGeometry?.primitives,
    primitive => primitive.role === 'value'
  );
  const polylines = vcc?.importedGeometry?.primitives.filter(
    primitive => primitive.kind === 'polyline'
  ) ?? [];

  assert.ok(vcc);
  assert.equal(vcc?.importedGeometry?.renderSource, 'fallback');
  assert.ok(polylines.length >= 2, 'expected external power fallback to emit cross-like line primitives');
  assert.equal(vcc?.importedGeometry?.primitives.some(primitive => primitive.kind === 'rect'), false);
  assert.equal(referenceTexts.length, 0);
  assert.equal(valueTexts.length, 1);
  assert.equal(valueTexts[0]?.text, 'VCC');
});

test('importKiCadSchematic uses connector-shaped fallback graphics for generic connector symbols', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Connector_Generic:Conn_01x03_Male"
      (property "Reference" "J" (id 0) (at 0 0 0))
      (property "Value" "Conn_01x03_Male" (id 1) (at 0 -2.54 0))
      (symbol "Conn_01x03_Male_1_1"
        (pin passive line (at 5.08 0 180) (length 2.54)
          (name "Pin_1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 2.54 180) (length 2.54)
          (name "Pin_2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 5.08 180) (length 2.54)
          (name "Pin_3" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Connector_Generic:Conn_01x03_Male")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "j-1")
    (property "Reference" "J1" (id 0) (at 50.8 45.72 0))
    (property "Value" "Conn_01x03_Male" (id 1) (at 50.8 55.88 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'generic connector' });
  const connector = result.document.components[0];
  const rects = connector?.importedGeometry?.primitives.filter(primitive => primitive.kind === 'rect') ?? [];

  assert.ok(connector);
  assert.ok(connector?.templateId.startsWith('kicad_'));
  assert.equal(connector?.importedMapping?.source, 'custom-fallback');
  assert.equal(connector?.importedGeometry?.renderSource, 'primitive');
  assert.equal(rects.length, 1);
  assert.ok((rects[0]?.end.y ?? 0) - (rects[0]?.start.y ?? 0) > (rects[0]?.end.x ?? 0) - (rects[0]?.start.x ?? 0));
  assert.ok(
    connector?.importedGeometry?.primitives.some(
      primitive => primitive.kind === 'text' && primitive.role === 'pin-number' && primitive.text === '1'
    )
  );
  assert.equal(
    connector?.importedGeometry?.primitives.some(
      primitive => primitive.kind === 'text' && primitive.role === 'pin-name' && primitive.text === 'Pin_1'
    ),
    false
  );
  assert.equal(
    connector?.importedGeometry?.primitives.some(
      primitive => primitive.kind === 'text' && primitive.role === 'value' && primitive.text === 'Conn_01x03_Male'
    ),
    true
  );
});

test('importKiCadSchematic derives a board-header body for connector symbols that behave like MCU headers', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Connector_Generic:Raspberry_Pi_2_3"
      (property "Reference" "J" (id 0) (at 0 0 0))
      (property "Value" "Raspberry_Pi_2_3" (id 1) (at 0 -2.54 0))
      (symbol "Raspberry_Pi_2_3_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "GPIO14/TXD" (effects (font (size 1.27 1.27))))
          (number "8" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at -5.08 2.54 0) (length 2.54)
          (name "GPIO15/RXD" (effects (font (size 1.27 1.27))))
          (number "10" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at -5.08 5.08 0) (length 2.54)
          (name "GPIO17" (effects (font (size 1.27 1.27))))
          (number "11" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at -5.08 7.62 0) (length 2.54)
          (name "GPIO18/PWM0" (effects (font (size 1.27 1.27))))
          (number "12" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 0 180) (length 2.54)
          (name "3V3" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 2.54 180) (length 2.54)
          (name "5V" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 5.08 180) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "6" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 7.62 180) (length 2.54)
          (name "GPIO4" (effects (font (size 1.27 1.27))))
          (number "7" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Connector_Generic:Raspberry_Pi_2_3")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "pi-header-1")
    (property "Reference" "J1" (id 0) (at 50.8 45.72 0))
    (property "Value" "Raspberry_Pi_2_3" (id 1) (at 50.8 55.88 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'header connector' });
  const connector = result.document.components[0];
  const rects = connector?.importedGeometry?.primitives.filter(primitive => primitive.kind === 'rect') ?? [];
  const headerRect = rects[0];

  assert.ok(connector);
  assert.equal(connector?.importedGeometry?.renderSource, 'primitive');
  assert.ok(headerRect, 'expected a derived body rect for the board-header style connector');
  assert.ok(((headerRect?.end.x ?? 0) - (headerRect?.start.x ?? 0)) >= 6.5);
  assert.ok(((headerRect?.end.y ?? 0) - (headerRect?.start.y ?? 0)) >= 8);
  assert.ok(
    connector?.importedGeometry?.primitives.some(
      primitive => primitive.kind === 'text' && primitive.role === 'pin-name' && primitive.text === 'GPIO14/TXD'
    )
  );
  assert.equal(
    connector?.importedGeometry?.primitives.some(
      primitive => primitive.kind === 'text' && primitive.role === 'value' && primitive.text === 'Raspberry_Pi_2_3'
    ),
    true
  );
});

test('importKiCadSchematic keeps explicit battery reference and voltage text while suppressing generic battery value text', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Device:Battery"
      (property "Reference" "BT" (id 0) (at 0 0 0))
      (property "Value" "Battery" (id 1) (at 0 -2.54 0))
      (symbol "Battery_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "+" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 5.08 0 180) (length 2.54)
          (name "-" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Device:Battery")
    (at 40 50 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "battery-1")
    (property "Reference" "BT1" (id 0) (at 40 44 0))
    (property "Value" "3V" (id 1) (at 40 54 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'battery label cleanup' });
  const battery = result.document.components[0];
  const batteryReferenceTexts = filterTextPrimitives(
    battery?.importedGeometry?.primitives,
    primitive => primitive.role === 'reference'
  );
  const batteryValueTexts = filterTextPrimitives(
    battery?.importedGeometry?.primitives,
    primitive => primitive.role === 'value'
  );

  assert.ok(battery);
  assert.ok(batteryReferenceTexts.some(primitive => primitive.text === 'BT1'));
  assert.ok(batteryValueTexts.some(primitive => primitive.text === '3V'));
});

test('importKiCadSchematic derives a primitive IC body from pin geometry when a source symbol has no body graphics', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Vendor:BodylessMcu"
      (property "Reference" "U" (id 0) (at 0 0 0))
      (property "Value" "ATmega328P-PU" (id 1) (at 0 -2.54 0))
      (symbol "BodylessMcu_1_1"
        (pin input line (at -5.08 0 0) (length 2.54)
          (name "PB0" (effects (font (size 1.27 1.27))))
          (number "14" (effects (font (size 1.27 1.27))))
        )
        (pin input line (at -5.08 2.54 0) (length 2.54)
          (name "PB1" (effects (font (size 1.27 1.27))))
          (number "15" (effects (font (size 1.27 1.27))))
        )
        (pin input line (at -5.08 5.08 0) (length 2.54)
          (name "PB2" (effects (font (size 1.27 1.27))))
          (number "16" (effects (font (size 1.27 1.27))))
        )
        (pin input line (at 5.08 0 180) (length 2.54)
          (name "PC0" (effects (font (size 1.27 1.27))))
          (number "23" (effects (font (size 1.27 1.27))))
        )
        (pin input line (at 5.08 2.54 180) (length 2.54)
          (name "PC1" (effects (font (size 1.27 1.27))))
          (number "24" (effects (font (size 1.27 1.27))))
        )
        (pin input line (at 5.08 5.08 180) (length 2.54)
          (name "PC2" (effects (font (size 1.27 1.27))))
          (number "25" (effects (font (size 1.27 1.27))))
        )
        (pin power_in line (at 0 -7.62 90) (length 2.54)
          (name "VCC" (effects (font (size 1.27 1.27))))
          (number "7" (effects (font (size 1.27 1.27))))
        )
        (pin power_in line (at 0 7.62 270) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "8" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "Vendor:BodylessMcu")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "u-3")
    (property "Reference" "U3" (id 0) (at 50.8 45.72 0))
    (property "Value" "ATmega328P-PU" (id 1) (at 50.8 55.88 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'bodyless mcu' });
  const imported = result.document.components[0];
  const rects = imported?.importedGeometry?.primitives.filter(primitive => primitive.kind === 'rect') ?? [];
  const pinNames = filterTextPrimitives(
    imported?.importedGeometry?.primitives,
    primitive => primitive.role === 'pin-name'
  );
  const pinNumbers = filterTextPrimitives(
    imported?.importedGeometry?.primitives,
    primitive => primitive.role === 'pin-number'
  );
  const topPowerPinName = pinNames.find(primitive => primitive.text === 'VCC');
  const topPowerPinNumber = pinNumbers.find(primitive => primitive.text === '7');
  const sceneSymbol = result.document.importedSchematicScene?.symbols?.find(
    symbol => symbol.instanceId === imported?.instanceId
  );
  const sceneRightSidePinName = findSceneSymbolText(
    sceneSymbol,
    primitive => primitive.role === 'pin-name' && primitive.text === 'PC0'
  );
  const sceneRightSidePinNumber = findSceneSymbolText(
    sceneSymbol,
    primitive => primitive.role === 'pin-number' && primitive.text === '23'
  );
  const sceneLeftSidePinName = findSceneSymbolText(
    sceneSymbol,
    primitive => primitive.role === 'pin-name' && primitive.text === 'PB0'
  );
  const sceneLeftSidePinNumber = findSceneSymbolText(
    sceneSymbol,
    primitive => primitive.role === 'pin-number' && primitive.text === '14'
  );

  assert.ok(imported);
  assert.equal(imported?.importedGeometry?.renderSource, 'primitive');
  assert.ok(rects.length >= 1);
  assert.ok(pinNames.some(primitive => primitive.text === 'PB0'));
  assert.ok(pinNumbers.some(primitive => primitive.text === '14'));
  assert.equal(topPowerPinName?.textAnchor, 'middle');
  assert.equal(topPowerPinName?.baseline, 'middle');
  assert.equal(topPowerPinNumber?.textAnchor, 'middle');
  assert.equal(topPowerPinNumber?.baseline, 'middle');
  assert.equal(sceneRightSidePinName?.angle, 180);
  assert.equal(sceneRightSidePinName?.originalAngle, 180);
  assert.ok(
    sceneRightSidePinName &&
      sceneRightSidePinNumber &&
      sceneRightSidePinName.at.x < sceneRightSidePinNumber.at.x,
    'expected right-side pin names to stay closer to the body than their pin numbers'
  );
  assert.ok(
    sceneLeftSidePinName &&
      sceneLeftSidePinNumber &&
      sceneLeftSidePinName.at.x > sceneLeftSidePinNumber.at.x,
    'expected left-side pin names to stay closer to the body than their pin numbers'
  );
});

test('importKiCadSchematic preserves native KiCad text justification for source property text', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "MCU_Vendor:JustifiedPart"
      (property "Reference" "U" (id 0) (at 0 0 0))
      (property "Value" "JustifiedPart" (id 1) (at 0 -2.54 0))
      (symbol "JustifiedPart_1_1"
        (rectangle (start -5.08 -5.08) (end 5.08 5.08)
          (stroke (width 0) (type solid))
          (fill (type background))
        )
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "LEFT_PIN" (effects (font (size 1.27 1.27)) (justify right bottom)))
          (number "1" (effects (font (size 1.27 1.27)) (justify left top)))
        )
      )
    )
  )
  (symbol
    (lib_id "MCU_Vendor:JustifiedPart")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "u-justify-1")
    (property "Reference" "U9" (id 0) (at 44 45 0)
      (effects (font (size 1.27 1.27)) (justify right bottom))
    )
    (property "Value" "JustifiedValue" (id 1) (at 57 58 0)
      (effects (font (size 1.27 1.27)) (justify left top))
    )
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'justified text' });
  const imported = result.document.components[0];
  const primitives = imported?.importedGeometry?.primitives ?? [];
  const reference = findTextPrimitive(primitives, primitive => primitive.role === 'reference');
  const value = findTextPrimitive(primitives, primitive => primitive.role === 'value');
  assert.equal(reference?.textAnchor, 'end');
  assert.equal(reference?.baseline, 'ideographic');
  assert.equal(value?.textAnchor, 'start');
  assert.equal(value?.baseline, 'hanging');
});

test('importKiCadSchematic preserves native annotation originalAngle through rotated instances', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "Demo:RotText"
      (property "Reference" "U" (id 0) (at 0 0 0))
      (property "Value" "RotText" (id 1) (at 0 -2.54 0))
      (symbol "RotText_1_1"
        (rectangle (start -5.08 -5.08) (end 5.08 5.08)
          (stroke (width 0) (type solid))
          (fill (type none))
        )
        (text "SIDE"
          (at 7.62 0 0)
          (effects (font (size 1.27 1.27)) (justify left bottom))
        )
      )
    )
  )
  (symbol
    (lib_id "Demo:RotText")
    (at 50.8 50.8 90)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "u-rot-1")
    (property "Reference" "U1" (id 0) (at 45 44 0))
    (property "Value" "RotText" (id 1) (at 57 58 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'rotated native text' });
  const sceneSymbol = result.document.importedSchematicScene?.symbols?.find(
    symbol => symbol.reference === 'U1'
  );
  const nativeText = findSceneSymbolText(
    sceneSymbol,
    primitive => primitive.role === 'annotation' && primitive.text === 'SIDE'
  );

  assert.ok(nativeText);
  assert.equal(nativeText?.angle, 270);
  assert.equal(nativeText?.originalAngle, 270);
  assert.equal(nativeText?.preserveNativeOrientation, true);
});

test('importKiCadSchematic preserves hierarchical sheet frames in imported scene overlay', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (paper "A4")
  (title_block
    (title "Raspberry Pi review")
    (date "2026-06-19")
    (rev "A")
  )
  (sheet
    (at 120 80)
    (size 40 30)
    (stroke (width 0) (type solid))
    (fill (color 0 0 0 0))
    (uuid "sheet-1")
    (property "Sheetname" "connectors1" (id 0) (at 120 78 0))
    (property "Sheetfile" "connectors1.sch" (id 1) (at 120 112 0))
    (pin "SCK" input (at 120 90 180) (effects (font (size 1.27 1.27))))
    (pin "VCC" input (at 160 95 0) (effects (font (size 1.27 1.27))))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'sheet only' });
  const sheetFrames = result.document.importedSchematicScene?.sheetFrames ?? [];
  const pageFrame = result.document.importedSchematicScene?.pageFrame;

  assert.equal(pageFrame?.paper, 'A4');
  assert.equal(pageFrame?.titleBlock?.title, 'Raspberry Pi review');
  assert.equal(pageFrame?.titleBlock?.date, '2026-06-19');
  assert.equal(sheetFrames.length, 1);
  assert.equal(sheetFrames[0]?.name, 'connectors1');
  assert.equal(sheetFrames[0]?.file, 'connectors1.sch');
  assert.deepEqual(
    sheetFrames[0]?.pins.map(pin => pin.text),
    ['SCK', 'VCC']
  );
});

test('importKiCadSchematic stores rotated property text in local geometry coordinates', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (paper "A4")
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 -2 0))
      (property "Value" "R" (id 1) (at 0 2 0))
      (rectangle (start -2 -1) (end 2 1) (stroke (width 0) (type default)) (fill (type none)))
      (pin passive line (at -6 0 0) (length 2.54) (name "1" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
      (pin passive line (at 6 0 180) (length 2.54) (name "2" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
    )
  )
  (symbol
    (lib_id "Device:R")
    (at 100 100 90)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "rotated-r1")
    (property "Reference" "R1" (id 0) (at 100 94 90))
    (property "Value" "220 Ohm" (id 1) (at 100 106 90))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'rotated text import' });
  const imported = result.document.components[0];
  const textPrimitives = filterTextPrimitives(
    imported?.importedGeometry?.primitives,
    primitive => primitive.role === 'reference' || primitive.role === 'value'
  );
  const referenceText = textPrimitives.find(primitive => primitive.role === 'reference');
  const valueText = textPrimitives.find(primitive => primitive.role === 'value');

  assert.ok(imported);
  assert.deepEqual(referenceText?.at, { x: 6, y: 0 });
  assert.deepEqual(valueText?.at, { x: -6, y: 0 });
  assert.equal(referenceText?.angle, 180);
  assert.equal(valueText?.angle, 180);
  assert.equal(referenceText?.preserveNativeOrientation, true);
  assert.equal(valueText?.preserveNativeOrientation, true);
});

test('importKiCadSchematic creates a generated custom template for fallback generic connector symbols', () => {
  setRuntimeCustomComponentPackages([{
    version: '1.0.0',
    templateId: 'custom_probe',
    name: 'Custom Probe',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'VCC', allowedTypes: ['POWER'], preferredSide: 'left' },
      { name: 'GND', allowedTypes: ['GND'], preferredSide: 'left' },
      { name: 'SIG', allowedTypes: ['DIGITAL'], preferredSide: 'right' },
    ],
  }]);

  try {
    const schematic = buildKiCadSchematic({
      projectName: 'custom bridge',
      activeBoardId: 'uno',
      components: [
        {
          instanceId: 'probe-1',
          templateId: 'custom_probe',
          name: '커스텀 프로브 1',
          value: 'Probe',
          position: { x: 480, y: 220 },
          rotation: 0,
          assignedPins: {
            VCC: '5V',
            GND: 'GND',
            SIG: 'D2',
          },
          isFullyRouted: true,
        },
      ],
      manualConnections: [],
    });

    const result = importKiCadSchematic(schematic, { projectName: 'custom bridge' });
    const imported = result.document.components[0];
    const importedTemplate = result.document.templateCache?.[imported!.templateId];

    assert.equal(result.summary.generatedCustomComponentCount, 1);
    assert.equal(result.summary.fallbackComponentCount, 1);
    assert.equal(result.summary.lowConfidenceComponentCount, 1);
    assert.match(imported!.templateId, /^kicad_custom_probe$/);
    assert.ok(importedTemplate);
    assert.equal(importedTemplate.name, 'Custom Probe');
    assert.deepEqual(
      importedTemplate.requiredPins.map(pin => pin.name),
      ['VCC', 'GND', 'SIG']
    );
  } finally {
    setRuntimeCustomComponentPackages([]);
  }
});

test('importKiCadSchematic maps symbol with prefix mismatch to standard template (e.g. power:GND)', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "GND"
      (property "Reference" "#PWR" (id 0) (at 0 0 0))
      (property "Value" "GND" (id 1) (at 0 -2.54 0))
      (polyline
        (pts (xy 0 0) (xy 0 2.54))
      )
      (symbol "GND_1_1"
        (pin power_in line (at 0 -2.54 90) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "power:GND")
    (at 20 20 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "gnd-1")
    (property "Reference" "#PWR0101" (id 0) (at 20 16 0))
    (property "Value" "GND" (id 1) (at 20 24 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'standard template prefix mismatch' });
  const imported = result.document.components[0];

  assert.ok(imported);
  assert.equal(imported.templateId, 'kicad_gnd');
  assert.equal(imported.importedGeometry?.renderSource, 'primitive');
});

test('importKiCadSchematic includes board symbols in importedSchematicScene.symbols', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "MCU_Module:Arduino_Uno_R3"
      (property "Reference" "A" (id 0) (at 0 0 0))
      (property "Value" "Arduino_Uno_R3" (id 1) (at 0 -2.54 0))
      (symbol "Arduino_Uno_R3_1_1"
        (pin power_in line (at -5.08 0 0) (length 2.54)
          (name "5V" (effects (font (size 1.27 1.27))))
          (number "5" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "MCU_Module:Arduino_Uno_R3")
    (at 20 20 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "board-uno-1")
    (property "Reference" "A1" (id 0) (at 20 16 0))
    (property "Value" "Arduino_Uno_R3" (id 1) (at 20 24 0))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'board symbol scene test' });
  const boardSymbol = result.document.importedSchematicScene?.symbols?.find(
    symbol => symbol.instanceId === 'board-uno-1'
  );

  assert.ok(boardSymbol, 'expected board-type symbol to be populated in importedSchematicScene.symbols');
  assert.equal(boardSymbol.reference, 'A1');
  assert.equal(boardSymbol.value, 'Arduino_Uno_R3');
  assert.ok(boardSymbol.primitives.length > 0);
});

test('importKiCadSchematic parses and preserves text justification effects (justify left/right/top/bottom)', () => {
  const schematic = `
(kicad_sch
  (version 20211123)
  (generator "eeschema")
  (lib_symbols
    (symbol "MCU_Module:Arduino_Uno_R3"
      (property "Reference" "A" (id 0) (at 0 0 0))
      (property "Value" "Arduino_Uno_R3" (id 1) (at 0 -2.54 0))
      (rectangle (start -10 -10) (end 10 10) (stroke (width 0)) (fill (type none)))
      (symbol "Arduino_Uno_R3_0_1"
        (text "TEST_LABEL" (at 0 5 0)
          (effects (font (size 1 1)) (justify left bottom))
        )
      )
      (symbol "Arduino_Uno_R3_1_1"
        (pin power_in line (at -5.08 0 0) (length 2.54)
          (name "5V" (effects (font (size 1.27 1.27)) (justify right top)))
          (number "5" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (symbol
    (lib_id "MCU_Module:Arduino_Uno_R3")
    (at 20 20 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "board-uno-1")
    (property "Reference" "A1" (id 0) (at 20 16 0)
      (effects (font (size 1.27 1.27)) (justify left top))
    )
    (property "Value" "Arduino_Uno_R3" (id 1) (at 20 24 0)
      (effects (font (size 1.27 1.27)) (justify right bottom))
    )
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'justification test' });
  const symbol = result.document.importedSchematicScene?.symbols?.find(
    s => s.instanceId === 'board-uno-1'
  );

  assert.ok(symbol);

  // Verify reference text justification (left top)
  const refText = findSceneSymbolText(symbol, primitive => primitive.role === 'reference');
  assert.ok(refText);
  assert.equal(refText.textAnchor, 'start'); // left -> start
  assert.equal(refText.baseline, 'hanging'); // top -> hanging

  // Verify value text justification (right bottom)
  const valText = findSceneSymbolText(symbol, primitive => primitive.role === 'value');
  assert.ok(valText);
  assert.equal(valText.textAnchor, 'end'); // right -> end
  assert.equal(valText.baseline, 'ideographic'); // bottom -> ideographic

  // Generated pin text should preserve native KiCad pin text justification when it exists.
  const pinNameText = findSceneSymbolText(symbol, primitive => primitive.role === 'pin-name');
  assert.ok(pinNameText);
  assert.equal(pinNameText.textAnchor, 'end');
  assert.equal(pinNameText.baseline, 'ideographic');
});

test('importKiCadSchematic respects symbol-level pin_numbers hide and pin_names hide display settings', () => {
  const schematic = `(kicad_sch
  (version 20240101)
  (generator "test")
  (paper "A4")
  (lib_symbols
    (symbol "Test:HiddenPins"
      (pin_numbers hide)
      (pin_names hide)
      (property "Reference" "U" (id 0) (at 0 6 0)
        (effects (font (size 1.27 1.27)))
      )
      (property "Value" "HiddenPins" (id 1) (at 0 -6 0)
        (effects (font (size 1.27 1.27)))
      )
      (symbol "HiddenPins_1_1"
        (rectangle (start -4 -4) (end 4 4) (stroke (width 0)) (fill (type none)))
        (pin passive line (at -6 0 0) (length 2.54)
          (name "IN" (effects (font (size 1 1))))
          (number "1" (effects (font (size 1 1))))
        )
      )
    )
  )
  (symbol
    (lib_id "Test:HiddenPins")
    (at 20 20 0)
    (unit 1)
    (uuid "hidden-1")
    (property "Reference" "U1" (id 0) (at 20 14 0) (effects (font (size 1.27 1.27))))
    (property "Value" "HiddenPins" (id 1) (at 20 26 0) (effects (font (size 1.27 1.27))))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'hidden pin display settings' });
  const symbol = result.document.importedSchematicScene?.symbols?.find(
    sceneSymbol => sceneSymbol.instanceId === 'hidden-1'
  );

  assert.ok(symbol);
  assert.equal(
    symbol?.primitives.filter(
      primitive => primitive.kind === 'text' && primitive.role === 'pin-number'
    ).length,
    0
  );
  assert.equal(
    symbol?.primitives.filter(
      primitive => primitive.kind === 'text' && primitive.role === 'pin-name'
    ).length,
    0
  );
});

test('importKiCadSchematic uses native symbol pin_names offset to keep generated labels tighter to the body', () => {
  const schematic = `(kicad_sch
  (version 20240101)
  (generator "test")
  (paper "A4")
  (lib_symbols
    (symbol "Connector:OffsetNear"
      (pin_names (offset 0))
      (property "Reference" "U" (id 0) (at 0 6 0) (effects (font (size 1.27 1.27))))
      (property "Value" "OffsetNear" (id 1) (at 0 -6 0) (effects (font (size 1.27 1.27))))
      (symbol "OffsetNear_1_1"
        (rectangle (start -4 -4) (end 4 4) (stroke (width 0)) (fill (type none)))
        (pin passive line (at -6 0 0) (length 2.54)
          (name "LEFT" (effects (font (size 1 1))))
          (number "1" (effects (font (size 1 1))))
        )
      )
    )
    (symbol "Connector:OffsetFar"
      (pin_names (offset 1.016))
      (property "Reference" "U" (id 0) (at 0 6 0) (effects (font (size 1.27 1.27))))
      (property "Value" "OffsetFar" (id 1) (at 0 -6 0) (effects (font (size 1.27 1.27))))
      (symbol "OffsetFar_1_1"
        (rectangle (start -4 -4) (end 4 4) (stroke (width 0)) (fill (type none)))
        (pin passive line (at -6 0 0) (length 2.54)
          (name "LEFT" (effects (font (size 1 1))))
          (number "1" (effects (font (size 1 1))))
        )
      )
    )
  )
  (symbol
    (lib_id "Connector:OffsetNear")
    (at 20 20 0)
    (unit 1)
    (uuid "offset-near")
    (property "Reference" "U1" (id 0) (at 20 14 0) (effects (font (size 1.27 1.27))))
    (property "Value" "OffsetNear" (id 1) (at 20 26 0) (effects (font (size 1.27 1.27))))
  )
  (symbol
    (lib_id "Connector:OffsetFar")
    (at 50 20 0)
    (unit 1)
    (uuid "offset-far")
    (property "Reference" "U2" (id 0) (at 50 14 0) (effects (font (size 1.27 1.27))))
    (property "Value" "OffsetFar" (id 1) (at 50 26 0) (effects (font (size 1.27 1.27))))
  )
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'pin name offset test' });
  const nearSymbol = result.document.importedSchematicScene?.symbols?.find(
    sceneSymbol => sceneSymbol.instanceId === 'offset-near'
  );
  const farSymbol = result.document.importedSchematicScene?.symbols?.find(
    sceneSymbol => sceneSymbol.instanceId === 'offset-far'
  );

  const nearName = findSceneSymbolText(
    nearSymbol,
    primitive => primitive.role === 'pin-name' && primitive.text === 'LEFT'
  );
  const farName = findSceneSymbolText(
    farSymbol,
    primitive => primitive.role === 'pin-name' && primitive.text === 'LEFT'
  );

  assert.ok(nearName);
  assert.ok(farName);
  assert.ok(
    farName!.at.x > nearName!.at.x,
    'expected larger KiCad pin_names offset to push generated left-side pin name deeper toward the body'
  );
});

test('importKiCadSchematic restores connectivity across matching global labels', () => {
  const schematic = `(kicad_sch
  (version 20240101)
  (generator "test")
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "10k" (id 1) (at 0 -2.54 0))
      (symbol "R_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "1" (effects (font (size 1 1))))
          (number "1" (effects (font (size 1 1))))
        )
        (pin passive line (at 5.08 0 180) (length 2.54)
          (name "2" (effects (font (size 1 1))))
          (number "2" (effects (font (size 1 1))))
        )
      )
    )
  )
  (symbol
    (lib_id "Device:R")
    (at 20 20 0)
    (unit 1)
    (uuid "r-1")
    (property "Reference" "R1" (id 0) (at 20 14 0))
    (property "Value" "10k" (id 1) (at 20 26 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 60 20 0)
    (unit 1)
    (uuid "r-2")
    (property "Reference" "R2" (id 0) (at 60 14 0))
    (property "Value" "10k" (id 1) (at 60 26 0))
  )
  (global_label "NET_A" (shape input) (at 14.92 20 0))
  (global_label "NET_B" (shape input) (at 25.08 20 0))
  (global_label "NET_A" (shape input) (at 54.92 20 0))
  (global_label "NET_B" (shape input) (at 65.08 20 0))
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'global label merge test' });
  const components = result.document.components;
  const manualConnections = result.document.manualConnections ?? [];

  assert.equal(manualConnections.length, 2);
  assert.deepEqual(
    new Set(manualConnections.map(connection => connection.suggestedNetName)),
    new Set(['NET_A', 'NET_B'])
  );
  assert.ok(components.every(component => component.isFullyRouted));
});

test('importKiCadSchematic restores connectivity across matching local labels on the same sheet', () => {
  const schematic = `(kicad_sch
  (version 20240101)
  (generator "test")
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "10k" (id 1) (at 0 -2.54 0))
      (symbol "R_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "1" (effects (font (size 1 1))))
          (number "1" (effects (font (size 1 1))))
        )
        (pin passive line (at 5.08 0 180) (length 2.54)
          (name "2" (effects (font (size 1 1))))
          (number "2" (effects (font (size 1 1))))
        )
      )
    )
  )
  (symbol
    (lib_id "Device:R")
    (at 20 20 0)
    (unit 1)
    (uuid "r-3")
    (property "Reference" "R3" (id 0) (at 20 14 0))
    (property "Value" "10k" (id 1) (at 20 26 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 60 20 0)
    (unit 1)
    (uuid "r-4")
    (property "Reference" "R4" (id 0) (at 60 14 0))
    (property "Value" "10k" (id 1) (at 60 26 0))
  )
  (label "NET_A" (at 14.92 20 0))
  (label "NET_B" (at 25.08 20 0))
  (label "NET_A" (at 54.92 20 0))
  (label "NET_B" (at 65.08 20 0))
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'local label isolation test' });

  assert.equal(result.document.manualConnections?.length ?? 0, 2);
  assert.deepEqual(
    new Set((result.document.manualConnections ?? []).map(connection => connection.suggestedNetName)),
    new Set(['NET_A', 'NET_B'])
  );
  assert.ok(result.document.components.every(component => component.isFullyRouted));
});

test('importKiCadSchematic keeps local and global labels with the same name in separate scopes', () => {
  const schematic = `(kicad_sch
  (version 20240101)
  (generator "test")
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "10k" (id 1) (at 0 -2.54 0))
      (symbol "R_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "1" (effects (font (size 1 1))))
          (number "1" (effects (font (size 1 1))))
        )
      )
    )
  )
  (symbol
    (lib_id "Device:R")
    (at 20 20 0)
    (unit 1)
    (uuid "r-local")
    (property "Reference" "R1" (id 0) (at 20 14 0))
    (property "Value" "10k" (id 1) (at 20 26 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 80 20 0)
    (unit 1)
    (uuid "r-global")
    (property "Reference" "R2" (id 0) (at 80 14 0))
    (property "Value" "10k" (id 1) (at 80 26 0))
  )
  (label "DATA" (at 14.92 20 0))
  (global_label "DATA" (shape input) (at 74.92 20 0))
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'scope split test' });

  assert.equal(result.document.manualConnections?.length ?? 0, 0);
  assert.ok(result.document.components.every(component => component.isFullyRouted === false));
});

test('importKiCadSchematic normalizes common power aliases before joining labels', () => {
  const schematic = `(kicad_sch
  (version 20240101)
  (generator "test")
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "10k" (id 1) (at 0 -2.54 0))
      (symbol "R_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "1" (effects (font (size 1 1))))
          (number "1" (effects (font (size 1 1))))
        )
      )
    )
  )
  (symbol
    (lib_id "Device:R")
    (at 20 20 0)
    (unit 1)
    (uuid "r-vdd")
    (property "Reference" "R1" (id 0) (at 20 14 0))
    (property "Value" "10k" (id 1) (at 20 26 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 80 20 0)
    (unit 1)
    (uuid "r-vcc")
    (property "Reference" "R2" (id 0) (at 80 14 0))
    (property "Value" "10k" (id 1) (at 80 26 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 60 0)
    (unit 1)
    (uuid "r-3v3")
    (property "Reference" "R3" (id 0) (at 20 54 0))
    (property "Value" "10k" (id 1) (at 20 66 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 80 60 0)
    (unit 1)
    (uuid "r-3p3")
    (property "Reference" "R4" (id 0) (at 80 54 0))
    (property "Value" "10k" (id 1) (at 80 66 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 100 0)
    (unit 1)
    (uuid "r-plus12")
    (property "Reference" "R5" (id 0) (at 20 94 0))
    (property "Value" "10k" (id 1) (at 20 106 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 80 100 0)
    (unit 1)
    (uuid "r-12")
    (property "Reference" "R6" (id 0) (at 80 94 0))
    (property "Value" "10k" (id 1) (at 80 106 0))
  )
  (label "VDD" (at 14.92 20 0))
  (label "VCC" (at 74.92 20 0))
  (label "3V3" (at 14.92 60 0))
  (label "3.3V" (at 74.92 60 0))
  (label "+12V" (at 14.92 100 0))
  (label "12V" (at 74.92 100 0))
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'power alias normalization test' });

  assert.equal(result.document.manualConnections?.length ?? 0, 3);
  assert.deepEqual(
    new Set((result.document.manualConnections ?? []).map(connection => connection.suggestedNetName)),
    new Set(['VDD', '3V3', '+12V'])
  );
});

test('importKiCadSchematic does not merge matching sheet pins across different sheet frames by name alone', () => {
  const schematic = `(kicad_sch
  (version 20240101)
  (generator "test")
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (id 0) (at 0 0 0))
      (property "Value" "10k" (id 1) (at 0 -2.54 0))
      (symbol "R_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "1" (effects (font (size 1 1))))
          (number "1" (effects (font (size 1 1))))
        )
      )
    )
  )
  (symbol
    (lib_id "Device:R")
    (at 20 25 0)
    (unit 1)
    (uuid "r-sheet-a")
    (property "Reference" "R1" (id 0) (at 20 19 0))
    (property "Value" "10k" (id 1) (at 20 31 0))
  )
  (symbol
    (lib_id "Device:R")
    (at 20 75 0)
    (unit 1)
    (uuid "r-sheet-b")
    (property "Reference" "R2" (id 0) (at 20 69 0))
    (property "Value" "10k" (id 1) (at 20 81 0))
  )
  (sheet
    (at 40 10)
    (size 30 20)
    (property "Sheetname" "A" (id 0) (at 40 8 0))
    (property "Sheetfile" "a.kicad_sch" (id 1) (at 40 32 0))
    (pin "DATA" input (at 40 25 180))
  )
  (sheet
    (at 40 60)
    (size 30 20)
    (property "Sheetname" "B" (id 0) (at 40 58 0))
    (property "Sheetfile" "b.kicad_sch" (id 1) (at 40 82 0))
    (pin "DATA" input (at 40 75 180))
  )
  (wire (pts (xy 17.46 25) (xy 40 25)))
  (wire (pts (xy 17.46 75) (xy 40 75)))
  (sheet_instances
    (path "/" (page "1"))
  )
)`;

  const result = importKiCadSchematic(schematic, { projectName: 'sheet pin scope test' });

  assert.equal(result.document.manualConnections?.length ?? 0, 0);
  assert.ok(result.document.components.every(component => component.isFullyRouted === false));
});
