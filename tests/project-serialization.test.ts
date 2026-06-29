import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import type { ImportedSchematicScene, ModuMakeProjectData, PlacedComponent } from '@/types';
import { getInitialPins } from '@/constants/board-pins';
import { getTemplateById } from '@/constants/component-templates';
import { buildKiCadSchematic } from '@/lib/export-kicad';
import { layoutImportedGeometry } from '@/lib/imported-schematic-geometry';
import { importKiCadSchematic } from '@/lib/kicad-sch-parser';
import { SAVED_PROJECT_STORAGE_KEY } from '@/store/store-config';

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

function resetStore(boardId = 'uno', options: { clearStorage?: boolean } = {}) {
  if (options.clearStorage ?? true) {
    localStorage.clear();
  }
  useBoardStore.getState().hydrateProject({
    version: 3,
    savedAt: '2026-06-17T00:00:00.000Z',
    projectName: 'reset',
    activeBoardId: boardId,
    pins: getInitialPins(boardId),
    components: [],
    manualConnections: [],
    generatedCode: '',
    codeError: null,
    customComponentPackages: [],
    isGuestStudentMode: false,
    powerInputMode: 'usb-5v',
    workspaceMode: 'simulation',
    wiringMode: 'auto',
    showGrid: true,
    showMinimap: true,
    schematicTheme: 'dark',
  });
}

function sortObjectKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => sortObjectKeys(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {}) as T;
  }

  return value;
}

function canonicalProjectShape(document: ModuMakeProjectData) {
  return sortObjectKeys({
    version: document.version,
    projectName: document.projectName,
    activeBoardId: document.activeBoardId,
    pins: Object.fromEntries(
      Object.entries(document.pins).map(([pinId, pin]) => [
        pinId,
        {
          id: pin.id,
          type: [...pin.type],
          isUsed: pin.isUsed,
          connectedTo: pin.connectedTo ?? null,
          assignmentMode: pin.assignmentMode ?? null,
        },
      ])
    ),
    components: [...document.components]
      .sort((left, right) => left.instanceId.localeCompare(right.instanceId))
      .map(component => ({
        instanceId: component.instanceId,
        templateId: component.templateId,
        name: component.name,
        value: component.value ?? null,
        position: component.position,
        rotation: component.rotation,
        assignedPins: sortObjectKeys(component.assignedPins),
        isFullyRouted: component.isFullyRouted,
      })),
    manualConnections: [...document.manualConnections]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(connection => ({
        id: connection.id,
        source: connection.source,
        target: connection.target,
        suggestedNetName: connection.suggestedNetName ?? null,
      })),
    generatedCode: document.generatedCode,
    codeError: document.codeError,
    lastCodeGenerationMeta: document.lastCodeGenerationMeta ?? null,
    customComponentPackages: document.customComponentPackages ?? [],
    isGuestStudentMode: document.isGuestStudentMode ?? false,
    powerInputMode: document.powerInputMode,
    componentPowerModes: sortObjectKeys(document.componentPowerModes ?? {}),
    componentUnusedPinModes: sortObjectKeys(document.componentUnusedPinModes ?? {}),
    workspaceMode: document.workspaceMode,
    wiringMode: document.wiringMode,
    showGrid: document.showGrid,
    showMinimap: document.showMinimap,
    schematicTheme: document.schematicTheme ?? 'dark',
    pcbSummary: document.pcbDocument
      ? {
          boardId: document.pcbDocument.boardId,
          boardName: document.pcbDocument.boardName,
          netCount: document.pcbDocument.nets.length,
          placementCount: document.pcbDocument.placements.length,
          traceCount: document.pcbDocument.traces.length,
          viaCount: document.pcbDocument.vias.length,
          zoneCount: document.pcbDocument.zones.length,
          keepoutCount: document.pcbDocument.keepouts.length,
        }
      : null,
  });
}

async function loadFixtureProject(relativePath: string) {
  const text = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  return JSON.parse(text) as ModuMakeProjectData;
}

async function runFixtureRoundTrip(relativePath: string) {
  resetStore();
  const payload = await loadFixtureProject(relativePath);

  const hydrated = useBoardStore.getState().hydrateProject(payload);
  assert.equal(hydrated.success, true, `fixture ${relativePath} should hydrate`);

  const exportedOnce = useBoardStore.getState().serializeProject();
  const fileText = JSON.stringify(exportedOnce, null, 2);
  const parsedAgain = JSON.parse(fileText) as ModuMakeProjectData;

  const rehydrated = useBoardStore.getState().hydrateProject(parsedAgain);
  assert.equal(rehydrated.success, true, `fixture ${relativePath} should rehydrate after export`);

  const exportedTwice = useBoardStore.getState().serializeProject();

  assert.deepEqual(
    canonicalProjectShape(exportedOnce),
    canonicalProjectShape(exportedTwice),
    `fixture ${relativePath} should survive export/import round-trip`
  );

  assert.ok(exportedTwice.pcbDocument, `fixture ${relativePath} should regenerate pcbDocument on export`);
  assert.ok(
    (exportedTwice.pcbDocument?.placements.length ?? 0) >= exportedTwice.components.length,
    `fixture ${relativePath} should keep PCB placements aligned with components`
  );
}

async function runImportedKiCadRoundTrip(filePath: string, projectName: string) {
  resetStore('kicad_generic');

  const source = await readFile(filePath, 'utf8');
  const imported = importKiCadSchematic(source, { projectName });
  const firstSegment = imported.document.importedSchematicScene?.wireSegments[0];
  const firstLabel = imported.document.importedSchematicScene?.labels[0];
  const firstDrawing = imported.document.importedSchematicScene?.drawings?.[0];
  const firstSymbol = imported.document.importedSchematicScene?.symbols?.[0];

  assert.ok(imported.document.importedSchematicScene);
  assert.ok(firstSegment, `${projectName} should expose at least one imported wire segment`);

  const hydrated = useBoardStore.getState().hydrateProject(imported.document);
  assert.equal(hydrated.success, true, `${projectName} should hydrate after import`);

  const exported = useBoardStore.getState().serializeProject();
  const rehydrated = useBoardStore.getState().hydrateProject(JSON.parse(JSON.stringify(exported)));
  assert.equal(rehydrated.success, true, `${projectName} should survive JSON cloud-style reload`);

  const restored = useBoardStore.getState().serializeProject();
  const restoredSegment = restored.importedSchematicScene?.wireSegments[0];
  const restoredLabel = restored.importedSchematicScene?.labels[0];

  assert.ok(restored.importedSchematicScene);
  assert.ok(restoredSegment, `${projectName} should still expose imported wires after reload`);
  assert.equal(
    restored.importedSchematicScene?.wireSegments.length,
    imported.document.importedSchematicScene?.wireSegments.length,
    `${projectName} should preserve imported wire counts after reload`
  );
  assert.equal(
    restored.importedSchematicScene?.labels.length,
    imported.document.importedSchematicScene?.labels.length,
    `${projectName} should preserve imported label counts after reload`
  );
  assert.equal(
    restored.importedSchematicScene?.symbols?.length ?? 0,
    imported.document.importedSchematicScene?.symbols?.length ?? 0,
    `${projectName} should preserve imported scene symbol counts after reload`
  );
  assert.equal(
    restored.importedSchematicScene?.drawings?.length ?? 0,
    imported.document.importedSchematicScene?.drawings?.length ?? 0,
    `${projectName} should preserve imported drawing counts after reload`
  );
  assert.deepEqual(
    restoredSegment,
    firstSegment,
    `${projectName} should keep the first wire segment at the exact same coordinates after reload`
  );

  if (firstLabel) {
    assert.deepEqual(
      restoredLabel,
      firstLabel,
      `${projectName} should keep the first label at the exact same coordinates after reload`
    );
  }

  if (firstDrawing) {
    assert.deepEqual(
      restored.importedSchematicScene?.drawings?.[0],
      firstDrawing,
      `${projectName} should keep the first native drawing primitive unchanged after reload`
    );
  }

  if (firstSymbol) {
    assert.equal(
      restored.importedSchematicScene?.symbols?.[0]?.family,
      firstSymbol.family,
      `${projectName} should preserve imported scene symbol family through reload`
    );
  }
}

test('serializeProject round-trips a live edited project state without losing structure', () => {
  resetStore('uno');

  useBoardStore.setState(state => ({
    ...state,
    projectName: 'Roundtrip Project',
    activeBoardId: 'uno',
    pins: {
      ...getInitialPins('uno'),
      D2: {
        ...getInitialPins('uno').D2,
        isUsed: true,
        connectedTo: 'sensor-1',
        assignmentMode: 'manual',
      },
      A4: {
        ...getInitialPins('uno').A4,
        isUsed: true,
        connectedTo: 'display-1',
        assignmentMode: 'auto',
      },
    },
    components: [
      {
        instanceId: 'sensor-1',
        templateId: 'tpl_dht11',
        name: '온습도 센서 1',
        value: 'DHT11',
        position: { x: 420, y: 180 },
        rotation: 90,
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
          Data: 'D2',
        },
        isFullyRouted: true,
      },
      {
        instanceId: 'display-1',
        templateId: 'tpl_oled',
        name: 'OLED 1',
        value: '0x3C',
        position: { x: 690, y: 210 },
        rotation: 0,
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
          SDA: 'A4',
          SCL: 'A5',
        },
        isFullyRouted: true,
      },
    ] as PlacedComponent[],
    manualConnections: [
      {
        id: 'manual-led-chain',
        source: { ownerType: 'component', ownerId: 'sensor-1', pinId: 'Data' },
        target: { ownerType: 'board', ownerId: 'board-node', pinId: 'D2' },
        suggestedNetName: 'DHT_DATA',
      },
    ],
    generatedCode: 'void setup() {}\nvoid loop() {}',
    codeError: null,
    lastCodeGenerationMeta: {
      provider: 'gemini',
      model: 'gemini-flash-latest',
      label: 'Gemini · 검수 통과',
      repaired: true,
      fallback: false,
      reviewIssueCount: 1,
      reviewErrorCount: 0,
    },
    customComponentPackages: [],
    isGuestStudentMode: false,
    powerInputMode: 'usb-5v',
    workspaceMode: 'simulation',
    wiringMode: 'manual',
    showGrid: false,
    showMinimap: true,
  }));

  const exportedOnce = useBoardStore.getState().serializeProject();
  const roundTrippedPayload = JSON.parse(JSON.stringify(exportedOnce)) as ModuMakeProjectData;
  const result = useBoardStore.getState().hydrateProject(roundTrippedPayload);
  assert.equal(result.success, true);

  const exportedTwice = useBoardStore.getState().serializeProject();

  assert.deepEqual(canonicalProjectShape(exportedOnce), canonicalProjectShape(exportedTwice));
});

test('serializeProject preserves imported schematic text primitives across round-trip', () => {
  resetStore('kicad_generic');

  useBoardStore.setState(state => ({
    ...state,
    projectName: 'Imported text roundtrip',
    activeBoardId: 'kicad_generic',
    importedSchematicSource: '(kicad_sch (version 20211123) (generator "roundtrip-test"))',
    importedSchematicScene: {
      wireSegments: [
        {
          id: 'wire-1',
          start: { x: 280, y: 220 },
          end: { x: 320, y: 220 },
          netLabel: 'VCC',
          style: 'solid',
        },
      ],
      junctions: [],
      labels: [],
      pageFrame: null,
      sheetFrames: [],
    },
    integratedValidationJson: {
      schemaVersion: '2026-06-19',
      project: {
        projectName: 'Imported text roundtrip',
        boardId: 'kicad_generic',
        boardName: 'Imported schematic',
        sourceKind: 'kicad_import',
        importedComponentCount: 1,
        importedConnectionCount: 1,
        generatedCustomComponentCount: 0,
      },
      board: {
        boardId: 'kicad_generic',
        boardName: 'Imported schematic',
        logicVoltage: '5V',
        netLabels: ['VCC'],
        pinNames: ['VCC', 'GND'],
      },
      components: [],
      nets: [],
      codePinUsage: [],
      validationFlags: [],
      ruleFindings: [],
      extractionPlan: {
        strategy: 'focused-sections',
        globalSections: ['pin-description'],
        targets: [],
      },
    },
    components: [
      {
        instanceId: 'imported-cap-1',
        templateId: 'tpl_capacitor',
        name: '10uF',
        value: '10uF',
        position: { x: 300, y: 220 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
        importedReference: 'C1',
        importedGeometry: {
          bounds: { minX: -8, minY: -8, maxX: 8, maxY: 8 },
          renderSource: 'primitive',
          primitives: [
            {
              kind: 'text',
              at: { x: 0, y: -6 },
              text: 'C1',
              angle: 0,
              sizeMm: 1.27,
              role: 'reference',
            },
            {
              kind: 'text',
              at: { x: 0, y: 6 },
              text: '10uF',
              angle: 0,
              sizeMm: 1.27,
              role: 'value',
            },
          ],
          pinAnchors: [],
          referenceLabel: 'C1',
          valueLabel: '10uF',
        },
      },
    ] as PlacedComponent[],
  }));

  const exported = useBoardStore.getState().serializeProject();
  const roundTripped = JSON.parse(JSON.stringify(exported)) as ModuMakeProjectData;
  const hydrated = useBoardStore.getState().hydrateProject(roundTripped);

  assert.equal(hydrated.success, true);
  const restored = useBoardStore.getState().components[0];
  const restoredTexts = restored?.importedGeometry?.primitives.filter(primitive => primitive.kind === 'text') ?? [];

  assert.deepEqual(
    restoredTexts.map(primitive => primitive.text),
    ['C1', '10uF']
  );
  assert.equal(useBoardStore.getState().importedSchematicSource, '(kicad_sch (version 20211123) (generator "roundtrip-test"))');
  assert.equal(useBoardStore.getState().integratedValidationJson?.schemaVersion, '2026-06-19');
  assert.equal(restored?.importedGeometry?.renderSource, 'primitive');
});

test('serializeProject preserves KiCad scene and primitive pin rendering across cloud-style normalization', () => {
  resetStore('kicad_generic');

  useBoardStore.setState(state => ({
    ...state,
    projectName: 'Imported schematic cloud roundtrip',
    activeBoardId: 'kicad_generic',
    schematicTheme: 'light',
    importedSchematicSource: '(kicad_sch (version 20211123) (generator "cloud-roundtrip"))',
    integratedValidationJson: {
      schemaVersion: '2026-06-19',
      project: {
        projectName: 'Imported schematic cloud roundtrip',
        boardId: 'kicad_generic',
        boardName: 'Imported schematic',
        sourceKind: 'kicad_import',
        importedComponentCount: 1,
        importedConnectionCount: 2,
        generatedCustomComponentCount: 0,
      },
      board: {
        boardId: 'kicad_generic',
        boardName: 'Imported schematic',
        logicVoltage: '5V',
        netLabels: ['VCC', 'SDA'],
        pinNames: ['VCC', 'GND', 'SDA'],
      },
      components: [],
      nets: [],
      codePinUsage: [],
      validationFlags: [],
      ruleFindings: [],
      extractionPlan: {
        strategy: 'focused-sections',
        globalSections: ['pin-description'],
        targets: [],
      },
    },
    importedSchematicScene: {
      wireSegments: [
        { start: { x: 10, y: 20 }, end: { x: 80, y: 20 } },
        { start: { x: 80, y: 20 }, end: { x: 80, y: 60 } },
      ],
      junctions: [{ x: 80, y: 20 }],
      labels: [{ text: 'VCC', at: { x: 44, y: 20 } }],
      pageFrame: {
        start: { x: 0, y: 0 },
        end: { x: 1650, y: 1167 },
        paper: 'A4',
        titleBlock: {
          title: 'Imported schematic cloud roundtrip',
          date: '2026-06-19',
          rev: 'A',
          company: 'ModuMake',
          comments: ['Round-trip check'],
        },
      },
      sheetFrames: [
        {
          start: { x: 0, y: 0 },
          end: { x: 120, y: 90 },
          name: 'power',
          file: 'power.kicad_sch',
          pins: [{ text: 'SDA', at: { x: 120, y: 30 }, angle: 180 }],
        },
      ],
    } as ImportedSchematicScene,
    components: [
      {
        instanceId: 'imported-u1',
        templateId: 'kicad_mcu_microchip_atmega_atmega328p_pu',
        name: 'ATmega328P-PU',
        value: 'ATmega328P-PU',
        position: { x: 320, y: 240 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
        importedReference: 'U1',
        importedGeometry: {
          bounds: { minX: -10, minY: -20, maxX: 10, maxY: 20 },
          renderSource: 'primitive',
          pinRenderMode: 'primitive',
          primitives: [
            { kind: 'rect', start: { x: -10, y: -20 }, end: { x: 10, y: 20 } },
            {
              kind: 'text',
              at: { x: -8, y: -10 },
              text: 'PB0',
              angle: 0,
              sizeMm: 1.27,
              role: 'pin-name',
            },
            {
              kind: 'text',
              at: { x: 9, y: -10 },
              text: '14',
              angle: 0,
              sizeMm: 1.27,
              role: 'pin-number',
            },
          ],
          pinAnchors: [
            { pinId: 'PB0', label: 'PB0', number: '14', at: { x: 10, y: -10 }, angle: 0, lengthMm: 2.54 },
          ],
          referenceLabel: 'U1',
          valueLabel: 'ATmega328P-PU',
        },
      },
    ] as PlacedComponent[],
  }));

  const exported = useBoardStore.getState().serializeProject();
  const cloudStoredJson = JSON.parse(JSON.stringify({
    ...exported,
    __cloud: { ownerTokenHash: 'server-only' },
  })) as ModuMakeProjectData;
  const hydrated = useBoardStore.getState().hydrateProject(cloudStoredJson);

  assert.equal(hydrated.success, true);

  const restored = useBoardStore.getState().serializeProject();
  const restoredComponent = restored.components[0];
  const restoredTextRoles = restoredComponent?.importedGeometry?.primitives.flatMap(primitive =>
    primitive.kind === 'text' ? [primitive.role] : []
  );

  assert.equal(restored.activeBoardId, 'kicad_generic');
  assert.equal(restored.schematicTheme, 'light');
  assert.equal(restored.importedSchematicSource, '(kicad_sch (version 20211123) (generator "cloud-roundtrip"))');
  assert.equal(restored.integratedValidationJson?.schemaVersion, '2026-06-19');
  assert.equal(restored.importedSchematicScene?.wireSegments.length, 2);
  assert.equal(restored.importedSchematicScene?.junctions.length, 1);
  assert.equal(restored.importedSchematicScene?.labels[0]?.text, 'VCC');
  assert.equal(restored.importedSchematicScene?.pageFrame?.paper, 'A4');
  assert.equal(restored.importedSchematicScene?.pageFrame?.titleBlock?.title, 'Imported schematic cloud roundtrip');
  assert.equal(restored.importedSchematicScene?.pageFrame?.titleBlock?.comments[0], 'Round-trip check');
  assert.equal(restored.importedSchematicScene?.sheetFrames?.[0]?.pins[0]?.text, 'SDA');
  assert.equal(restoredComponent?.importedGeometry?.renderSource, 'primitive');
  assert.equal(restoredComponent?.importedGeometry?.pinRenderMode, 'primitive');
  assert.deepEqual(restoredTextRoles, ['pin-name', 'pin-number']);
});

test('cloud route catch-up keeps the live imported schematic instead of reloading over it', async () => {
  resetStore('kicad_generic');

  useBoardStore.setState(state => ({
    ...state,
    projectName: 'Just imported before cloud save',
    activeBoardId: 'kicad_generic',
    cloudProjectId: 'project-just-created',
    cloudIsOwner: true,
    cloudError: null,
    importedSchematicScene: {
      wireSegments: [{ start: { x: 10, y: 10 }, end: { x: 120, y: 10 } }],
      junctions: [{ x: 120, y: 10 }],
      labels: [{ text: '3V3', at: { x: 60, y: 10 } }],
      pageFrame: {
        start: { x: 0, y: 0 },
        end: { x: 1650, y: 1167 },
        paper: 'A4',
      },
      sheetFrames: [],
    },
    components: [
      {
        instanceId: 'live-imported-u1',
        templateId: 'kicad_mcu_microchip_atmega_atmega328p_pu',
        name: 'ATmega328P-PU',
        value: 'ATmega328P-PU',
        position: { x: 240, y: 180 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
        importedReference: 'U1',
        importedGeometry: {
          bounds: { minX: -10, minY: -30, maxX: 10, maxY: 30 },
          renderSource: 'primitive',
          pinRenderMode: 'primitive',
          primitives: [
            { kind: 'rect', start: { x: -10, y: -30 }, end: { x: 10, y: 30 } },
            {
              kind: 'text',
              at: { x: -6, y: -20 },
              text: 'GPIO2',
              angle: 0,
              sizeMm: 1.27,
              role: 'pin-name',
            },
          ],
          pinAnchors: [],
          referenceLabel: 'U1',
          valueLabel: 'ATmega328P-PU',
        },
      },
    ],
  }));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('loadCloudProjectFromLink should not refetch a live just-created imported schematic');
  }) as typeof fetch;

  try {
    const result = await useBoardStore.getState().loadCloudProjectFromLink('project-just-created');
    assert.equal(result.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const state = useBoardStore.getState();
  assert.equal(state.components[0]?.instanceId, 'live-imported-u1');
  assert.equal(state.importedSchematicScene?.pageFrame?.paper, 'A4');
  assert.equal(state.importedSchematicScene?.wireSegments.length, 1);
});

test('serializeProject preserves multiline imported scene labels across cloud-style roundtrip', () => {
  resetStore('kicad_generic');

  useBoardStore.setState(state => ({
    ...state,
    projectName: 'Multiline label roundtrip',
    activeBoardId: 'kicad_generic',
    importedSchematicScene: {
      wireSegments: [],
      junctions: [],
      labels: [
        {
          text: 'N7\npower output',
          at: { x: 120, y: 80 },
          angle: 0,
          sizeMm: 1.27,
          textAnchor: 'start',
          baseline: 'ideographic',
        },
      ],
      drawings: [],
      pageFrame: null,
      sheetFrames: [],
      symbols: [],
    },
    components: [],
  }));

  const exported = useBoardStore.getState().serializeProject();
  const hydrated = useBoardStore.getState().hydrateProject(JSON.parse(JSON.stringify(exported)));
  assert.equal(hydrated.success, true);

  const restored = useBoardStore.getState().serializeProject();
  assert.equal(restored.importedSchematicScene?.labels[0]?.text, 'N7\npower output');
});

test('cloud route loader can force a fresh server hydrate for shared links', async () => {
  resetStore('uno');

  useBoardStore.setState(state => ({
    ...state,
    projectName: 'stale local state',
    activeBoardId: 'uno',
    cloudProjectId: 'shared-imported-project',
    cloudIsOwner: true,
    importedSchematicScene: null,
    components: [],
    manualConnections: [],
  }));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    project: {
      id: 'shared-imported-project',
      title: 'Fresh imported project',
      visibility: 'unlisted',
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:00.000Z',
      isOwner: true,
      stateJson: {
        version: 3,
        savedAt: '2026-06-19T00:00:00.000Z',
        projectName: 'Fresh imported project',
        appLanguage: 'ko',
        activeBoardId: 'kicad_generic',
        pins: getInitialPins('kicad_generic'),
        components: [
          {
            instanceId: 'fresh-imported-u1',
            templateId: 'kicad_mcu_microchip_atmega_atmega328p_pu',
            name: 'ATmega328P-PU',
            value: 'ATmega328P-PU',
            position: { x: 320, y: 220 },
            rotation: 0,
            assignedPins: {},
            isFullyRouted: false,
            importedReference: 'U1',
            importedGeometry: {
              bounds: { minX: -10, minY: -30, maxX: 10, maxY: 30 },
              renderSource: 'primitive',
              pinRenderMode: 'primitive',
              primitives: [
                { kind: 'rect', start: { x: -10, y: -30 }, end: { x: 10, y: 30 } },
              ],
              pinAnchors: [],
              referenceLabel: 'U1',
              valueLabel: 'ATmega328P-PU',
            },
          },
        ],
        manualConnections: [],
        importedSchematicScene: {
          wireSegments: [{ start: { x: 10, y: 10 }, end: { x: 120, y: 10 } }],
          junctions: [{ x: 120, y: 10 }],
          labels: [{ text: '3V3', at: { x: 60, y: 10 } }],
          pageFrame: {
            start: { x: 0, y: 0 },
            end: { x: 1650, y: 1167 },
            paper: 'A4',
          },
          sheetFrames: [],
        },
        templateCache: {},
        installedLibraries: [],
        generatedCode: '',
        codeError: null,
        customComponentPackages: [],
        isGuestStudentMode: false,
        powerInputMode: 'usb-5v',
        workspaceMode: 'schematic',
        wiringMode: 'auto',
        showGrid: true,
        showMinimap: true,
        schematicTheme: 'dark',
      },
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  try {
    const result = await useBoardStore.getState().loadCloudProjectFromLink('shared-imported-project', {
      forceReload: true,
    });
    assert.equal(result.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const state = useBoardStore.getState();
  assert.equal(state.activeBoardId, 'kicad_generic');
  assert.equal(state.components[0]?.instanceId, 'fresh-imported-u1');
  assert.equal(state.importedSchematicScene?.wireSegments.length, 1);
  assert.equal(state.cloudProjectId, 'shared-imported-project');
});

test('hydrateProject restores referenced cached templates for database-backed components', () => {
  resetStore('uno');

  const result = useBoardStore.getState().hydrateProject({
    version: 3,
    savedAt: '2026-06-17T00:00:00.000Z',
    projectName: 'db-template-project',
    activeBoardId: 'uno',
    pins: getInitialPins('uno'),
    components: [
      {
        instanceId: 'db-sensor-1',
        templateId: 'db_tpl_sht31',
        name: 'SHT31 1',
        position: { x: 300, y: 180 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
      },
    ],
    manualConnections: [],
    templateCache: {
      db_tpl_sht31: {
        id: 'db_tpl_sht31',
        name: 'SHT31 온습도 센서',
        category: 'SENSOR',
        description: 'Supabase catalog component',
        icon: 'Thermometer',
        compatibleVoltage: 'BOTH',
        requiredPins: [
          { name: 'VCC', allowedTypes: ['POWER'] },
          { name: 'GND', allowedTypes: ['GND'] },
          { name: 'SDA', allowedTypes: ['DIGITAL'] },
          { name: 'SCL', allowedTypes: ['DIGITAL'] },
        ],
      },
    },
    generatedCode: '',
    codeError: null,
    customComponentPackages: [],
    isGuestStudentMode: false,
    powerInputMode: 'usb-5v',
    workspaceMode: 'simulation',
    wiringMode: 'auto',
    showGrid: true,
    showMinimap: true,
  });

  assert.equal(result.success, true);
  assert.equal(getTemplateById('db_tpl_sht31')?.name, 'SHT31 온습도 센서');

  const exported = useBoardStore.getState().serializeProject();
  assert.equal(exported.templateCache?.db_tpl_sht31?.name, 'SHT31 온습도 센서');
});

test('project fixture import/export round-trip stays stable for legacy blink example', async () => {
  await runFixtureRoundTrip('../examples/blink-uno.modumake.json');
});

test('project fixture import/export round-trip stays stable for current custom-sensor save', async () => {
  await runFixtureRoundTrip('./fixtures/projects/uno-sht31-review.modumake.json');
});

test('legacy project documents migrate forward on the next save without losing core circuit data', () => {
  resetStore('uno');

  const legacyDocument = {
    version: 1,
    savedAt: '2024-11-01T09:00:00.000Z',
    projectName: 'legacy-greenhouse',
    activeBoardId: 'uno',
    pins: {
      ...getInitialPins('uno'),
      D2: {
        ...getInitialPins('uno').D2,
        isUsed: true,
        connectedTo: 'legacy-dht',
      },
    },
    components: [
      {
        instanceId: 'legacy-dht',
        templateId: 'tpl_dht11',
        name: '레거시 온습도',
        position: { x: 360, y: 180 },
        rotation: 0,
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
          Data: 'D2',
        },
        isFullyRouted: true,
      },
    ],
    generatedCode: 'void setup() {}\nvoid loop() {}',
    showGrid: false,
  };

  const hydrated = useBoardStore.getState().hydrateProject(legacyDocument);
  assert.equal(hydrated.success, true);

  const stateAfterHydrate = useBoardStore.getState();
  assert.equal(stateAfterHydrate.projectName, 'legacy-greenhouse');
  assert.equal(stateAfterHydrate.components.length, 1);
  assert.equal(stateAfterHydrate.components[0]?.assignedPins.Data, 'D2');
  assert.equal(stateAfterHydrate.manualConnections.length, 0);
  assert.equal(stateAfterHydrate.powerInputMode, 'usb-5v');
  assert.equal(stateAfterHydrate.workspaceMode, 'simulation');
  assert.equal(stateAfterHydrate.wiringMode, 'auto');
  assert.equal(stateAfterHydrate.showGrid, false);
  assert.equal(stateAfterHydrate.showMinimap, true);

  const migratedExport = useBoardStore.getState().serializeProject();
  assert.equal(migratedExport.version, 3);
  assert.equal(migratedExport.projectName, 'legacy-greenhouse');
  assert.equal(migratedExport.components.length, 1);
  assert.equal(migratedExport.components[0]?.assignedPins.Data, 'D2');
  assert.equal(migratedExport.manualConnections.length, 0);
  assert.equal(migratedExport.powerInputMode, 'usb-5v');
  assert.equal(migratedExport.workspaceMode, 'simulation');
  assert.equal(migratedExport.wiringMode, 'auto');
  assert.equal(migratedExport.showGrid, false);
  assert.equal(migratedExport.showMinimap, true);
  assert.ok(migratedExport.pcbDocument, 'migrated export should rebuild pcbDocument in the current format');
});

test('component power mode selections survive save and reload', async () => {
  resetStore();

  const hydrated = useBoardStore.getState().hydrateProject({
    version: 3,
    savedAt: '2026-06-27T00:00:00.000Z',
    projectName: 'power-modes',
    activeBoardId: 'uno',
    pins: getInitialPins('uno'),
    components: [{
      instanceId: 'bt-1',
      templateId: 'tpl_hc06_bluetooth',
      name: 'HC-06 1',
      value: 'HC-06',
      position: { x: 120, y: 90 },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
    }],
    manualConnections: [],
    generatedCode: '',
    codeError: null,
    customComponentPackages: [],
    isGuestStudentMode: false,
    powerInputMode: 'usb-5v',
    componentPowerModes: {
      'bt-1': 'idle-unpaired',
      orphan: 'sleep',
    },
    workspaceMode: 'simulation',
    wiringMode: 'auto',
    showGrid: true,
    showMinimap: true,
    schematicTheme: 'dark',
  });

  assert.equal(hydrated.success, true);
  assert.deepEqual(useBoardStore.getState().componentPowerModes, {
    'bt-1': 'idle-unpaired',
  });

  const saved = await useBoardStore.getState().saveProjectToBrowser();
  assert.equal(saved.success, true);

  useBoardStore.getState().setComponentPowerMode('bt-1', 'connected');
  assert.deepEqual(useBoardStore.getState().componentPowerModes, {
    'bt-1': 'connected',
  });

  const loaded = await useBoardStore.getState().loadProjectFromBrowser();
  assert.equal(loaded.success, true);
  assert.deepEqual(useBoardStore.getState().componentPowerModes, {
    'bt-1': 'idle-unpaired',
  });
});

test('component unused pin policies survive save and reload', async () => {
  resetStore();

  const hydrated = useBoardStore.getState().hydrateProject({
    version: 3,
    savedAt: '2026-06-27T00:00:00.000Z',
    projectName: 'unused-pin-modes',
    activeBoardId: 'esp32',
    pins: getInitialPins('esp32'),
    components: [{
      instanceId: 'esp-1',
      templateId: 'tpl_esp32_dev',
      name: 'ESP32 Dev 1',
      value: 'ESP32',
      position: { x: 120, y: 90 },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
    }],
    manualConnections: [],
    generatedCode: '',
    codeError: null,
    customComponentPackages: [],
    isGuestStudentMode: false,
    powerInputMode: 'ext-3v3',
    componentUnusedPinModes: {
      'esp-1': {
        GPIO16: 'internal-pulldown',
        GPIO17: 'floating-ok',
      },
      orphan: {
        GPIO99: 'internal-pullup',
      },
    },
    workspaceMode: 'simulation',
    wiringMode: 'auto',
    showGrid: true,
    showMinimap: true,
    schematicTheme: 'dark',
  });

  assert.equal(hydrated.success, true);
  assert.deepEqual(useBoardStore.getState().componentUnusedPinModes, {
    'esp-1': {
      GPIO16: 'internal-pulldown',
      GPIO17: 'floating-ok',
    },
  });

  const saved = await useBoardStore.getState().saveProjectToBrowser();
  assert.equal(saved.success, true);

  useBoardStore.getState().setComponentUnusedPinMode('esp-1', 'GPIO16', 'external-pullup');
  assert.deepEqual(useBoardStore.getState().componentUnusedPinModes, {
    'esp-1': {
      GPIO16: 'external-pullup',
      GPIO17: 'floating-ok',
    },
  });

  const loaded = await useBoardStore.getState().loadProjectFromBrowser();
  assert.equal(loaded.success, true);
  assert.deepEqual(useBoardStore.getState().componentUnusedPinModes, {
    'esp-1': {
      GPIO16: 'internal-pulldown',
      GPIO17: 'floating-ok',
    },
  });
});

test('browser save/load restores an exported canvas fixture without regression', async () => {
  resetStore();
  const payload = await loadFixtureProject('./fixtures/projects/uno-sht31-review.modumake.json');

  const hydrated = useBoardStore.getState().hydrateProject(payload);
  assert.equal(hydrated.success, true);

  const beforeSave = useBoardStore.getState().serializeProject();
  const saved = await useBoardStore.getState().saveProjectToBrowser();
  assert.equal(saved.success, true);

  resetStore('uno', { clearStorage: false });
  const loaded = await useBoardStore.getState().loadProjectFromBrowser();
  assert.equal(loaded.success, true);

  const afterLoad = useBoardStore.getState().serializeProject();
  assert.deepEqual(canonicalProjectShape(beforeSave), canonicalProjectShape(afterLoad));
});

test('browser save backfills integrated validation snapshots for imported schematics that only have source text', async () => {
  resetStore('kicad_generic');

  const schematic = buildKiCadSchematic({
    projectName: 'Browser imported snapshot',
    activeBoardId: 'uno',
    components: [
      {
        instanceId: 'sensor-1',
        templateId: 'tpl_dht11',
        name: 'DHT11',
        value: 'DHT11',
        position: { x: 300, y: 160 },
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

  const imported = importKiCadSchematic(schematic, {
    projectName: 'Browser imported snapshot',
  });
  const legacyImportedDocument = {
    ...imported.document,
    integratedValidationJson: null,
  };

  const hydrated = useBoardStore.getState().hydrateProject(legacyImportedDocument);
  assert.equal(hydrated.success, true);

  const saved = await useBoardStore.getState().saveProjectToBrowser();
  assert.equal(saved.success, true);

  const stored = localStorage.getItem(SAVED_PROJECT_STORAGE_KEY);
  assert.ok(stored);

  const savedDocument = JSON.parse(stored!) as ModuMakeProjectData;
  assert.equal(savedDocument.integratedValidationJson?.schemaVersion, '2026-06-19');
  assert.equal(savedDocument.integratedValidationJson?.project.sourceKind, 'kicad_import');
  assert.equal(savedDocument.integratedValidationJson?.project.projectName, 'Browser imported snapshot');
});

test('hydrateProject repairs a broken imported render snapshot from stored KiCad source text', () => {
  resetStore('kicad_generic');

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
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin input line (at -7.62 0 0) (length 2.54)
          (name "DATA" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
        (pin no_connect line (at -7.62 2.54 0) (length 2.54)
          (name "NC" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.27 1.27)))))
        (pin power_in line (at 0 7.62 270) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "4" (effects (font (size 1.27 1.27))))))
    ))
  (symbol
    (lib_id "Sensor:DHT22")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "sensor-repair-1")
    (property "Reference" "U1" (id 0) (at 50.8 44.45 0))
    (property "Value" "DHT22" (id 1) (at 50.8 57.15 0)))
  (wire
    (pts (xy 43.18 50.8) (xy 30.48 50.8))
    (stroke (width 0) (type default))
    (uuid "wire-data"))
  (sheet_instances
    (path "/" (page "1")))
)`;

  const imported = importKiCadSchematic(schematic, { projectName: 'repair imported snapshot' });
  const corruptedDocument: ModuMakeProjectData = {
    ...imported.document,
    schematicTheme: 'light',
    generatedCode: 'void setup() {}',
    importedSchematicScene: {
      wireSegments: [],
      junctions: [],
      labels: [],
      pageFrame: null,
      sheetFrames: [],
    },
    components: imported.document.components.map(component => ({
      ...component,
      importedGeometry: component.importedGeometry
        ? {
            ...component.importedGeometry,
            primitives: [],
            pinAnchors: [],
          }
        : component.importedGeometry,
    })),
  };

  const hydrated = useBoardStore.getState().hydrateProject(corruptedDocument);
  assert.equal(hydrated.success, true);

  const repaired = useBoardStore.getState().serializeProject();
  const repairedComponent = repaired.components[0];
  const repairedLayout = repairedComponent?.importedGeometry
    ? layoutImportedGeometry(repairedComponent.importedGeometry, repairedComponent.rotation)
    : null;
  const repairedDataAnchor = repairedLayout?.pinAnchors.find(anchor => anchor.label === 'DATA');

  assert.equal(repaired.schematicTheme, 'light');
  assert.equal(repaired.generatedCode, 'void setup() {}');
  assert.ok((repaired.importedSchematicScene?.wireSegments.length ?? 0) > 0);
  assert.ok((repairedComponent?.importedGeometry?.primitives.length ?? 0) > 0);
  assert.ok((repairedComponent?.importedGeometry?.pinAnchors.length ?? 0) > 0);
  assert.ok(repairedDataAnchor);
});

test('hydrateProject repairs imported scenes whose stored wires drift far away from imported components', () => {
  resetStore('kicad_generic');

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
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin input line (at -7.62 0 0) (length 2.54)
          (name "DATA" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
        (pin no_connect line (at -7.62 2.54 0) (length 2.54)
          (name "NC" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.27 1.27)))))
        (pin power_in line (at 0 7.62 270) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "4" (effects (font (size 1.27 1.27))))))
    ))
  (symbol
    (lib_id "Sensor:DHT22")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "sensor-repair-2")
    (property "Reference" "U1" (id 0) (at 50.8 44.45 0))
    (property "Value" "DHT22" (id 1) (at 50.8 57.15 0)))
  (wire
    (pts (xy 43.18 50.8) (xy 30.48 50.8))
    (stroke (width 0) (type default))
    (uuid "wire-data"))
  (sheet_instances
    (path "/" (page "1")))
)`;

  const imported = importKiCadSchematic(schematic, { projectName: 'repair detached scene' });
  const driftedDocument: ModuMakeProjectData = {
    ...imported.document,
    importedSchematicScene: {
      ...(imported.document.importedSchematicScene ?? {
        wireSegments: [],
        junctions: [],
        labels: [],
        pageFrame: null,
        sheetFrames: [],
      }),
      wireSegments: (imported.document.importedSchematicScene?.wireSegments ?? []).map(segment => ({
        start: { x: segment.start.x + 10000, y: segment.start.y + 8000 },
        end: { x: segment.end.x + 10000, y: segment.end.y + 8000 },
      })),
      junctions: (imported.document.importedSchematicScene?.junctions ?? []).map(point => ({
        x: point.x + 10000,
        y: point.y + 8000,
      })),
      labels: (imported.document.importedSchematicScene?.labels ?? []).map(label => ({
        ...label,
        at: { x: label.at.x + 10000, y: label.at.y + 8000 },
      })),
      sheetFrames: [],
      pageFrame: null,
    },
  };

  const hydrated = useBoardStore.getState().hydrateProject(driftedDocument);
  assert.equal(hydrated.success, true);

  const repaired = useBoardStore.getState().serializeProject();
  const repairedComponent = repaired.components[0];
  const repairedLayout = repairedComponent?.importedGeometry
    ? layoutImportedGeometry(repairedComponent.importedGeometry, repairedComponent.rotation, undefined, {
        preserveStoredBounds: true,
      })
    : null;
  const repairedDataAnchor = repairedLayout?.pinAnchors.find(anchor => anchor.label === 'DATA');
  const repairedSegment = repaired.importedSchematicScene?.wireSegments[0];

  assert.ok(repairedComponent);
  assert.ok(repairedLayout);
  assert.ok(repairedDataAnchor);
  assert.ok(repairedSegment);

  const anchorX = repairedComponent!.position.x + repairedDataAnchor!.at.x;
  const anchorY = repairedComponent!.position.y + repairedDataAnchor!.at.y;

  assert.ok(Math.abs(anchorX - repairedSegment!.start.x) <= 0.5);
  assert.ok(Math.abs(anchorY - repairedSegment!.start.y) <= 0.5);
});

test('hydrateProject keeps legacy imported saves stable when both source text and scene are missing', () => {
  resetStore('kicad_generic');

  const legacyImportedDocument: ModuMakeProjectData = {
    version: 3,
    savedAt: '2026-06-20T00:00:00.000Z',
    projectName: 'legacy imported without source',
    activeBoardId: 'kicad_generic',
    pins: getInitialPins('kicad_generic'),
    components: [],
    manualConnections: [],
    importedSchematicScene: null,
    importedSchematicSource: null,
    integratedValidationJson: null,
    templateCache: {},
    installedLibraries: [],
    generatedCode: 'void setup() {}',
    codeError: null,
    lastCodeGenerationMeta: null,
    customComponentPackages: [],
    isGuestStudentMode: false,
    powerInputMode: 'usb-5v',
    workspaceMode: 'schematic',
    wiringMode: 'auto',
    showGrid: true,
    showMinimap: true,
    schematicTheme: 'dark',
  };

  const hydrated = useBoardStore.getState().hydrateProject(legacyImportedDocument);
  assert.equal(hydrated.success, true);

  const restored = useBoardStore.getState().serializeProject();
  assert.equal(restored.projectName, 'legacy imported without source');
  assert.equal(restored.importedSchematicSource, null);
  assert.equal(restored.importedSchematicScene, null);
  assert.equal(restored.generatedCode, 'void setup() {}');
});

test('imported schematic wire anchors stay aligned after serialize and hydrate roundtrip', () => {
  resetStore('kicad_generic');

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
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin input line (at -7.62 0 0) (length 2.54)
          (name "DATA" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
        (pin no_connect line (at -7.62 2.54 0) (length 2.54)
          (name "NC" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.27 1.27)))))
        (pin power_in line (at 0 7.62 270) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "4" (effects (font (size 1.27 1.27))))))
    ))
  (symbol
    (lib_id "Sensor:DHT22")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "sensor-rt-1")
    (property "Reference" "U1" (id 0) (at 50.8 44.45 0))
    (property "Value" "DHT22" (id 1) (at 50.8 57.15 0)))
  (wire
    (pts (xy 43.18 50.8) (xy 30.48 50.8))
    (stroke (width 0) (type default))
    (uuid "wire-data"))
  (sheet_instances
    (path "/" (page "1")))
)`;

  const imported = importKiCadSchematic(schematic, { projectName: 'roundtrip wire align' });
  const importedComponent = imported.document.components[0];
  const importedLayout = importedComponent?.importedGeometry
    ? layoutImportedGeometry(importedComponent.importedGeometry, importedComponent.rotation, undefined, {
        preserveStoredBounds: true,
      })
    : null;
  const importedDataAnchor = importedLayout?.pinAnchors.find(anchor => anchor.label === 'DATA');
  const importedSegment = imported.document.importedSchematicScene?.wireSegments[0];

  assert.ok(importedComponent);
  assert.ok(importedLayout);
  assert.ok(importedDataAnchor);
  assert.ok(importedSegment);

  const importedAnchorX = importedComponent!.position.x + importedDataAnchor!.at.x;
  const importedAnchorY = importedComponent!.position.y + importedDataAnchor!.at.y;

  assert.ok(Math.abs(importedAnchorX - importedSegment!.start.x) <= 0.5);
  assert.ok(Math.abs(importedAnchorY - importedSegment!.start.y) <= 0.5);

  const hydrated = useBoardStore.getState().hydrateProject(imported.document);
  assert.equal(hydrated.success, true);

  const exported = useBoardStore.getState().serializeProject();
  const rehydrated = useBoardStore.getState().hydrateProject(JSON.parse(JSON.stringify(exported)));
  assert.equal(rehydrated.success, true);

  const restored = useBoardStore.getState().serializeProject();
  const restoredComponent = restored.components[0];
  const restoredLayout = restoredComponent?.importedGeometry
    ? layoutImportedGeometry(restoredComponent.importedGeometry, restoredComponent.rotation, undefined, {
        preserveStoredBounds: true,
      })
    : null;
  const restoredDataAnchor = restoredLayout?.pinAnchors.find(anchor => anchor.label === 'DATA');
  const restoredSegment = restored.importedSchematicScene?.wireSegments[0];

  assert.ok(restoredComponent);
  assert.ok(restoredLayout);
  assert.ok(restoredDataAnchor);
  assert.ok(restoredSegment);

  const anchorX = restoredComponent!.position.x + restoredDataAnchor!.at.x;
  const anchorY = restoredComponent!.position.y + restoredDataAnchor!.at.y;

  assert.ok(Math.abs(anchorX - restoredSegment!.start.x) <= 0.5);
  assert.ok(Math.abs(anchorY - restoredSegment!.start.y) <= 0.5);
});

test('Arduino_hat imported scene keeps wires, labels, and symbols locked through serialize/hydrate roundtrip', async () => {
  await runImportedKiCadRoundTrip(
    '/Users/gimdong-il/Downloads/KICAD-main/Arduino hat/Arduino_hat.kicad_sch',
    'Arduino_hat'
  );
});

test('rasphat_proj2 imported scene keeps wires, labels, and symbols locked through serialize/hydrate roundtrip', async () => {
  await runImportedKiCadRoundTrip(
    '/Users/gimdong-il/Downloads/KICAD-main/rasphat_proj2/rasphat_proj2.kicad_sch',
    'rasphat_proj2'
  );
});

test('Flamingo p imported scene keeps wires, labels, and symbols locked through serialize/hydrate roundtrip', async () => {
  await runImportedKiCadRoundTrip(
    '/Users/gimdong-il/Downloads/KICAD-main/Flamingo cotnrol project/Flamingo p.kicad_sch',
    'Flamingo p'
  );
});

test('MATRIX PROJECT imported scene keeps wires, labels, and symbols locked through serialize/hydrate roundtrip', async () => {
  await runImportedKiCadRoundTrip(
    '/Users/gimdong-il/Downloads/KICAD-main/MATRIX PROJECT/MATRIX PROJECT.kicad_sch',
    'MATRIX PROJECT'
  );
});

test('P_supply imported scene keeps wires, labels, drawings, and symbol families locked through serialize/hydrate roundtrip', async () => {
  await runImportedKiCadRoundTrip(
    '/Users/gimdong-il/Downloads/KICAD-main/Breadboard-powersupply/P_supply.kicad_sch',
    'P_supply'
  );
});

test('hydrateProject rebuilds imported schematic geometry from source even when a stale scene snapshot still looks renderable', () => {
  resetStore('kicad_generic');

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
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin input line (at -7.62 0 0) (length 2.54)
          (name "DATA" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
        (pin no_connect line (at -7.62 2.54 0) (length 2.54)
          (name "NC" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.27 1.27)))))
        (pin power_in line (at 0 7.62 270) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "4" (effects (font (size 1.27 1.27))))))
    ))
  (symbol
    (lib_id "Sensor:DHT22")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "sensor-repair-1")
    (property "Reference" "U1" (id 0) (at 50.8 44.45 0))
    (property "Value" "DHT22" (id 1) (at 50.8 57.15 0)))
  (wire
    (pts (xy 43.18 50.8) (xy 30.48 50.8))
    (stroke (width 0) (type default))
    (uuid "wire-data"))
  (sheet_instances
    (path "/" (page "1")))
)`;

  const imported = importKiCadSchematic(schematic, { projectName: 'canonical source rebuild' });
  const staleDocument: ModuMakeProjectData = {
    ...imported.document,
    importedSchematicScene: {
      ...(imported.document.importedSchematicScene ?? {
        wireSegments: [],
        junctions: [],
        labels: [],
      }),
      wireSegments: (imported.document.importedSchematicScene?.wireSegments ?? []).map(segment => ({
        start: { x: segment.start.x + 48, y: segment.start.y + 12 },
        end: { x: segment.end.x + 48, y: segment.end.y + 12 },
      })),
    },
  };

  const hydrated = useBoardStore.getState().hydrateProject(staleDocument);
  assert.equal(hydrated.success, true);

  const restored = useBoardStore.getState().serializeProject();
  const restoredComponent = restored.components[0];
  const restoredLayout = restoredComponent?.importedGeometry
    ? layoutImportedGeometry(restoredComponent.importedGeometry, restoredComponent.rotation, undefined, {
        preserveStoredBounds: true,
      })
    : null;
  const restoredDataAnchor = restoredLayout?.pinAnchors.find(anchor => anchor.label === 'DATA');
  const restoredSegment = restored.importedSchematicScene?.wireSegments[0];

  assert.ok(restoredComponent);
  assert.ok(restoredLayout);
  assert.ok(restoredDataAnchor);
  assert.ok(restoredSegment);

  const anchorX = restoredComponent!.position.x + restoredDataAnchor!.at.x;
  const anchorY = restoredComponent!.position.y + restoredDataAnchor!.at.y;

  assert.ok(Math.abs(anchorX - restoredSegment!.start.x) <= 0.5);
  assert.ok(Math.abs(anchorY - restoredSegment!.start.y) <= 0.5);
});

test('createCloudProject also persists the imported validation snapshot through validation-jobs', async () => {
  resetStore('kicad_generic');

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
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin input line (at -7.62 0 0) (length 2.54)
          (name "DATA" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
        (pin no_connect line (at -7.62 2.54 0) (length 2.54)
          (name "NC" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.27 1.27)))))
        (pin power_in line (at 0 7.62 270) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "4" (effects (font (size 1.27 1.27))))))
    ))
  (symbol
    (lib_id "Sensor:DHT22")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "sensor-cloud-create-1")
    (property "Reference" "U1" (id 0) (at 50.8 44.45 0))
    (property "Value" "DHT22" (id 1) (at 50.8 57.15 0)))
  (wire
    (pts (xy 43.18 50.8) (xy 30.48 50.8))
    (stroke (width 0) (type default))
    (uuid "wire-data"))
  (sheet_instances
    (path "/" (page "1")))
)`;

  const imported = importKiCadSchematic(schematic, { projectName: 'cloud create validation snapshot' });
  const hydrated = useBoardStore.getState().hydrateProject({
    ...imported.document,
    integratedValidationJson: null,
  });
  assert.equal(hydrated.success, true);

  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = String(request?.url ?? input);
    const rawBody = request ? await request.text() : init?.body ? String(init.body) : '';
    const body = rawBody ? JSON.parse(rawBody) : null;
    fetchCalls.push({ url, body });

    if (url.endsWith('/api/projects')) {
      return new Response(JSON.stringify({
        project: {
          id: 'cloud-created-project',
          title: 'cloud create validation snapshot',
          visibility: 'unlisted',
          stateJson: imported.document,
          createdAt: '2026-06-19T00:00:00.000Z',
          updatedAt: '2026-06-19T00:00:00.000Z',
          isOwner: true,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.endsWith('/api/validation-jobs')) {
      return new Response(JSON.stringify({
        validationJobId: 'job-create-1',
        projectId: 'cloud-created-project',
        status: 'pending',
        counts: {
          components: 1,
          nets: 1,
          netMembers: 1,
          codePinUsages: 0,
          findings: 0,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch during createCloudProject test: ${url}`);
  }) as typeof fetch;

  try {
    const result = await useBoardStore.getState().createCloudProject('unlisted');
    assert.equal(result.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const validationCall = fetchCalls.find(call => call.url.endsWith('/api/validation-jobs'));
  assert.ok(validationCall);
  const validationBody = validationCall?.body as {
    validationInput: { source: { project_name: string }; stats: { component_count: number } };
    metadata: { projectId: string; sourceKind: string };
  };
  assert.equal(validationBody.metadata.projectId, 'cloud-created-project');
  assert.equal(validationBody.metadata.sourceKind, 'kicad_import');
  assert.equal(validationBody.validationInput.source.project_name, 'cloud create validation snapshot');
  assert.equal(validationBody.validationInput.stats.component_count, 1);
  assert.equal(useBoardStore.getState().cloudLastValidationJobId, 'job-create-1');
  assert.equal(useBoardStore.getState().cloudValidationPersistStatus, 'saved');
  assert.equal(useBoardStore.getState().cloudValidationPersistError, null);
});

test('saveProjectToCloud persists the imported validation snapshot through validation-jobs', async () => {
  resetStore('kicad_generic');

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
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin input line (at -7.62 0 0) (length 2.54)
          (name "DATA" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
        (pin no_connect line (at -7.62 2.54 0) (length 2.54)
          (name "NC" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.27 1.27)))))
        (pin power_in line (at 0 7.62 270) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "4" (effects (font (size 1.27 1.27))))))
    ))
  (symbol
    (lib_id "Sensor:DHT22")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "sensor-cloud-save-1")
    (property "Reference" "U1" (id 0) (at 50.8 44.45 0))
    (property "Value" "DHT22" (id 1) (at 50.8 57.15 0)))
  (wire
    (pts (xy 43.18 50.8) (xy 30.48 50.8))
    (stroke (width 0) (type default))
    (uuid "wire-data"))
  (sheet_instances
    (path "/" (page "1")))
)`;

  const imported = importKiCadSchematic(schematic, { projectName: 'cloud save validation snapshot' });
  const hydrated = useBoardStore.getState().hydrateProject({
    ...imported.document,
    integratedValidationJson: null,
  });
  assert.equal(hydrated.success, true);

  useBoardStore.setState(state => ({
    ...state,
    cloudProjectId: 'cloud-save-project',
    cloudProjectTitle: 'cloud save validation snapshot',
    cloudVisibility: 'unlisted',
    cloudIsOwner: true,
    cloudEditToken: 'token-1',
  }));

  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = String(request?.url ?? input);
    const rawBody = request ? await request.text() : init?.body ? String(init.body) : '';
    const body = rawBody ? JSON.parse(rawBody) : null;
    fetchCalls.push({ url, body });

    if (url.endsWith('/api/projects/cloud-save-project')) {
      return new Response(JSON.stringify({
        project: {
          id: 'cloud-save-project',
          title: 'cloud save validation snapshot',
          visibility: 'unlisted',
          stateJson: imported.document,
          createdAt: '2026-06-19T00:00:00.000Z',
          updatedAt: '2026-06-19T00:01:00.000Z',
          isOwner: true,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.endsWith('/api/validation-jobs')) {
      return new Response(JSON.stringify({
        validationJobId: 'job-save-1',
        projectId: 'cloud-save-project',
        status: 'pending',
        counts: {
          components: 1,
          nets: 1,
          netMembers: 1,
          codePinUsages: 0,
          findings: 0,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch during saveProjectToCloud test: ${url}`);
  }) as typeof fetch;

  try {
    const result = await useBoardStore.getState().saveProjectToCloud();
    assert.equal(result.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const validationCall = fetchCalls.find(call => call.url.endsWith('/api/validation-jobs'));
  assert.ok(validationCall);
  const validationBody = validationCall?.body as {
    validationInput: { source: { project_name: string }; stats: { component_count: number } };
    metadata: { projectId: string; sourceKind: string };
  };
  assert.equal(validationBody.metadata.projectId, 'cloud-save-project');
  assert.equal(validationBody.metadata.sourceKind, 'kicad_import');
  assert.equal(validationBody.validationInput.source.project_name, 'cloud save validation snapshot');
  assert.equal(validationBody.validationInput.stats.component_count, 1);
  assert.equal(useBoardStore.getState().cloudLastValidationJobId, 'job-save-1');
  assert.equal(useBoardStore.getState().cloudValidationPersistStatus, 'saved');
  assert.equal(useBoardStore.getState().cloudValidationPersistError, null);
});

test('saveProjectToCloud keeps validation persist failure visible in store state', async () => {
  resetStore('kicad_generic');

  const imported = importKiCadSchematic(`
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
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin input line (at -7.62 0 0) (length 2.54)
          (name "DATA" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
        (pin no_connect line (at -7.62 2.54 0) (length 2.54)
          (name "NC" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.27 1.27)))))
        (pin power_in line (at 0 7.62 270) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "4" (effects (font (size 1.27 1.27)))))))
  )
  (symbol
    (lib_id "Sensor:DHT22")
    (at 50.8 50.8 0)
    (unit 1)
    (in_bom yes)
    (on_board yes)
    (uuid "sensor-cloud-failure-1")
    (property "Reference" "U1" (id 0) (at 50.8 44.45 0))
    (property "Value" "DHT22" (id 1) (at 50.8 57.15 0)))
  (wire
    (pts (xy 43.18 50.8) (xy 30.48 50.8))
    (stroke (width 0) (type default))
    (uuid "wire-data"))
  (sheet_instances (path "/" (page "1")))
)`, { projectName: 'cloud validation failure state' });
  const hydrated = useBoardStore.getState().hydrateProject({
    ...imported.document,
    integratedValidationJson: null,
  });
  assert.equal(hydrated.success, true);

  useBoardStore.setState(state => ({
    ...state,
    cloudProjectId: 'cloud-failure-project',
    cloudProjectTitle: 'cloud validation failure state',
    cloudVisibility: 'unlisted',
    cloudIsOwner: true,
    cloudEditToken: 'token-1',
  }));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url.endsWith('/api/projects/cloud-failure-project')) {
      return new Response(JSON.stringify({
        project: {
          id: 'cloud-failure-project',
          title: 'cloud validation failure state',
          visibility: 'unlisted',
          stateJson: imported.document,
          createdAt: '2026-06-19T00:00:00.000Z',
          updatedAt: '2026-06-19T00:01:00.000Z',
          isOwner: true,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.endsWith('/api/validation-jobs')) {
      return new Response(JSON.stringify({
        error: 'validation insert failed',
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unexpected fetch during validation failure visibility test: ${url}`);
  }) as typeof fetch;

  try {
    const result = await useBoardStore.getState().saveProjectToCloud();
    assert.equal(result.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(useBoardStore.getState().cloudValidationPersistStatus, 'failed');
  assert.equal(useBoardStore.getState().cloudValidationPersistError, 'validation insert failed');
});
