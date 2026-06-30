import assert from 'node:assert/strict';
import test from 'node:test';

import { getInitialPins } from '@/constants/board-pins';
import type { ManualNetConnection, ModuMakeProjectData, PlacedComponent } from '@/types';

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

function makeComponent(overrides: Partial<PlacedComponent> & Pick<PlacedComponent, 'instanceId' | 'templateId' | 'name'>): PlacedComponent {
  return {
    value: undefined,
    position: { x: 120, y: 120 },
    rotation: 0,
    assignedPins: {},
    isFullyRouted: false,
    ...overrides,
  };
}

function buildProject(overrides: Partial<ModuMakeProjectData> = {}): ModuMakeProjectData {
  const boardId = overrides.activeBoardId ?? 'uno';
  return {
    version: 3,
    savedAt: '2026-06-29T00:00:00.000Z',
    projectName: 'state coverage',
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
    schematicTheme: 'light',
    ...overrides,
  };
}

function resetStore(overrides: Partial<ModuMakeProjectData> = {}) {
  localStorage.clear();
  const result = useBoardStore.getState().hydrateProject(buildProject(overrides));
  assert.equal(result.success, true);
}

test('wiring slice keeps manual pad connections deterministic and updates routed status', () => {
  const resistor = makeComponent({
    instanceId: 'res-1',
    templateId: 'tpl_resistor',
    name: 'R1',
    value: '330 Ohm',
  });
  const led = makeComponent({
    instanceId: 'led-1',
    templateId: 'tpl_led',
    name: 'LED 1',
  });

  resetStore({ components: [resistor, led] });

  const firstConnection = useBoardStore.getState().connectPads('res-1', '1', 'led-1', 'Signal');
  assert.deepEqual(firstConnection, { success: true });
  assert.equal(useBoardStore.getState().manualConnections.length, 1);
  assert.equal(useBoardStore.getState().components.find(component => component.instanceId === 'res-1')?.isFullyRouted, false);
  assert.equal(useBoardStore.getState().components.find(component => component.instanceId === 'led-1')?.isFullyRouted, false);

  const duplicateConnection = useBoardStore.getState().connectPads('led-1', 'Signal', 'res-1', '1');
  assert.equal(duplicateConnection.success, false);
  assert.equal(duplicateConnection.error, '이미 연결된 패드입니다.');
  assert.equal(useBoardStore.getState().manualConnections.length, 1);

  const secondConnection = useBoardStore.getState().connectPads('res-1', '2', 'led-1', 'GND');
  assert.deepEqual(secondConnection, { success: true });
  assert.equal(useBoardStore.getState().manualConnections.length, 2);
  assert.equal(useBoardStore.getState().components.find(component => component.instanceId === 'res-1')?.isFullyRouted, true);
  assert.equal(useBoardStore.getState().components.find(component => component.instanceId === 'led-1')?.isFullyRouted, true);

  const connectionId = useBoardStore.getState().manualConnections[0]?.id;
  assert.ok(connectionId);
  useBoardStore.getState().removeManualConnection(connectionId);

  assert.equal(useBoardStore.getState().manualConnections.length, 1);
  assert.equal(useBoardStore.getState().components.find(component => component.instanceId === 'res-1')?.isFullyRouted, false);
  assert.equal(useBoardStore.getState().components.find(component => component.instanceId === 'led-1')?.isFullyRouted, false);
});

test('history slice restores board pin assignments through undo and redo', () => {
  const sensor = makeComponent({
    instanceId: 'sensor-1',
    templateId: 'tpl_dht11',
    name: 'DHT11 1',
  });

  resetStore({ components: [sensor] });

  const assigned = useBoardStore.getState().assignPinToComponent('sensor-1', 'Data', 'D2');
  assert.deepEqual(assigned, { success: true });
  assert.equal(useBoardStore.getState().pins.D2?.isUsed, true);
  assert.equal(useBoardStore.getState().pins.D2?.connectedTo, 'sensor-1');
  assert.equal(useBoardStore.getState().components[0]?.assignedPins.Data, 'D2');
  assert.equal(useBoardStore.getState().canUndo, true);
  assert.equal(useBoardStore.getState().canRedo, false);

  useBoardStore.getState().undo();
  assert.equal(useBoardStore.getState().pins.D2?.isUsed, false);
  assert.equal(useBoardStore.getState().pins.D2?.connectedTo, undefined);
  assert.equal(useBoardStore.getState().components[0]?.assignedPins.Data, undefined);
  assert.equal(useBoardStore.getState().canUndo, false);
  assert.equal(useBoardStore.getState().canRedo, true);

  useBoardStore.getState().redo();
  assert.equal(useBoardStore.getState().pins.D2?.isUsed, true);
  assert.equal(useBoardStore.getState().pins.D2?.connectedTo, 'sensor-1');
  assert.equal(useBoardStore.getState().components[0]?.assignedPins.Data, 'D2');
  assert.equal(useBoardStore.getState().canUndo, true);
  assert.equal(useBoardStore.getState().canRedo, false);
});

test('board slice board changes clear workspace-only state while preserving power input choice', () => {
  const pins = getInitialPins('uno');
  pins.D2 = {
    ...pins.D2!,
    isUsed: true,
    connectedTo: 'led-1',
    assignmentMode: 'manual',
  };
  const manualConnection: ManualNetConnection = {
    id: 'conn-1',
    source: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
    target: { ownerType: 'component', ownerId: 'res-1', pinId: '1' },
  };

  resetStore({
    pins,
    components: [
      makeComponent({
        instanceId: 'led-1',
        templateId: 'tpl_led',
        name: 'LED 1',
        assignedPins: { Signal: 'D2' },
      }),
    ],
    manualConnections: [manualConnection],
    importedSchematicSource: '(kicad_sch)',
    integratedValidationJson: {
      schemaVersion: '2026-06-19',
      project: {
        projectName: 'state coverage',
        boardId: 'uno',
        boardName: 'Arduino Uno',
        sourceKind: 'modumake_canvas',
        importedComponentCount: 0,
        importedConnectionCount: 0,
        generatedCustomComponentCount: 0,
      },
      board: {
        boardId: 'uno',
        boardName: 'Arduino Uno',
        logicVoltage: '5V',
        netLabels: [],
        pinNames: ['D2'],
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
    validationReviewDecisions: {
      'issue-1': {
        primary: 'already-handled',
        flags: [],
        updatedAt: '2026-06-29T00:00:00.000Z',
      },
    },
    installedLibraries: [{
      name: 'DemoLib',
      version: '1.0.0',
      includes: ['DemoLib.h'],
      author: 'ModuMake',
      sentence: 'demo',
      category: 'Demo',
    }],
    generatedCode: 'void setup() {}',
    codeError: 'compile failed',
    powerInputMode: 'ext-5v',
    workspaceMode: 'schematic',
    wiringMode: 'manual',
  });

  useBoardStore.getState().setActiveBoardId('esp32_devkit');
  const state = useBoardStore.getState();

  assert.equal(state.activeBoardId, 'esp32_devkit');
  assert.deepEqual(state.components, []);
  assert.deepEqual(state.manualConnections, []);
  assert.equal(state.importedSchematicSource, null);
  assert.equal(state.integratedValidationJson, null);
  assert.deepEqual(state.validationReviewDecisions, {});
  assert.deepEqual(state.installedLibraries, []);
  assert.equal(state.generatedCode, '');
  assert.equal(state.codeError, null);
  assert.equal(state.powerInputMode, 'ext-5v');
  assert.deepEqual(state.componentPowerModes, {});
  assert.deepEqual(state.componentUnusedPinModes, {});
  assert.equal(state.selectedComponentId, null);
  assert.equal(state.canUndo, true);
});
