import test from 'node:test';
import assert from 'node:assert/strict';

import { getInitialPins } from '@/constants/board-pins';

function installLocalStorageMock() {
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
}

installLocalStorageMock();

const { useBoardStore } = await import('@/store/use-board-store');

function resetStore(boardId = 'uno') {
  localStorage.clear();
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

test('hydrateProject normalizes malicious project payloads and drops invalid pin data', () => {
  resetStore();

  const result = useBoardStore.getState().hydrateProject({
    version: 99,
    savedAt: '2026-06-17T00:00:00.000Z',
    projectName: '<script>alert(1)</script> demo',
    activeBoardId: 'totally-unknown-board',
    pins: {
      D2: {
        id: 'D2',
        type: ['POWER'],
        isUsed: 'yes',
        connectedTo: '<img src=x onerror=alert(1)>',
        assignmentMode: 'danger',
      },
      EVIL: {
        id: 'EVIL',
        type: ['POWER'],
        isUsed: true,
        connectedTo: 'x',
        assignmentMode: 'manual',
      },
    },
    components: [
      {
        instanceId: 'sensor-1',
        templateId: 'tpl_dht11',
        name: '<b>Temp Sensor</b>',
        value: '10k<script>',
        position: { x: Number.NaN, y: 45 },
        rotation: 45,
        assignedPins: {
          Data: 'D2',
          Bad: 'EVIL',
          Broken: 3,
        },
        isFullyRouted: true,
      },
      {
        invalid: true,
      },
    ],
    manualConnections: [
      {
        id: 'conn-1',
        source: { ownerType: 'component', ownerId: '<node>', pinId: 'DATA__source' },
        target: { ownerType: 'board', ownerId: 'board-node', pinId: 'D2' },
        suggestedNetName: '<b>DATA NET</b>',
      },
      {
        id: 2,
        source: null,
        target: null,
      },
    ],
    generatedCode: '#include <Wire.h>\nvoid setup() {}',
    codeError: '<b>compile error</b>',
    installedLibraries: [
      {
        name: '<b>Servo</b>',
        version: 'latest',
        includes: ['Servo.h', '<img src=x>'],
        author: '<script>Arduino</script>',
        sentence: '<b>servo library</b>',
        category: '<i>Device Control</i>',
      },
    ],
    customComponentPackages: [
      {
        version: '1.0.0',
        templateId: 'user_<sht31>',
        name: '<SHT31>',
        category: 'SENSOR',
        compatibleVoltage: 'BOTH',
        requiredPins: [
          { name: 'SDA', allowedTypes: ['DIGITAL'] },
        ],
      },
    ],
    isGuestStudentMode: true,
    powerInputMode: 'explode-rail',
    workspaceMode: 'mystery-mode',
    wiringMode: 'laser',
    showGrid: false,
    showMinimap: 'yes',
    schematicTheme: 'light',
  });

  assert.equal(result.success, true);

  const state = useBoardStore.getState();
  const defaultPins = getInitialPins('uno');

  assert.equal(state.activeBoardId, 'uno');
  assert.doesNotMatch(state.projectName, /[<>]/);
  assert.equal(Object.keys(state.pins).sort().join(','), Object.keys(defaultPins).sort().join(','));
  assert.deepEqual(state.pins.D2.type, defaultPins.D2.type);
  assert.equal(state.pins.D2.isUsed, false);
  assert.equal(state.pins.D2.connectedTo, undefined);
  assert.equal(state.pins.D2.assignmentMode, undefined);
  assert.equal((state.pins as Record<string, unknown>).EVIL, undefined);

  assert.equal(state.components.length, 1);
  assert.doesNotMatch(state.components[0].name, /[<>]/);
  assert.doesNotMatch(state.components[0].value ?? '', /[<>]/);
  assert.equal(state.components[0].position.x, 0);
  assert.equal(state.components[0].position.y, 45);
  assert.equal(state.components[0].rotation, 0);
  assert.deepEqual(state.components[0].assignedPins, { Data: 'D2' });

  assert.equal(state.manualConnections.length, 1);
  assert.equal(state.manualConnections[0].source.ownerId, 'node');
  assert.equal(state.manualConnections[0].source.pinId, 'DATA');
  assert.doesNotMatch(state.manualConnections[0].suggestedNetName ?? '', /[<>]/);

  assert.equal(state.generatedCode.includes('#include <Wire.h>'), true);
  assert.doesNotMatch(state.codeError ?? '', /[<>]/);
  assert.equal(state.installedLibraries.length, 1);
  assert.equal(state.installedLibraries[0].name, 'bServo/b');
  assert.deepEqual(state.installedLibraries[0].includes, ['Servo.h', 'img src=x']);
  assert.equal(state.customComponentPackages.length, 1);
  assert.doesNotMatch(state.customComponentPackages[0].name, /[<>]/);
  assert.equal(state.powerInputMode, 'usb-5v');
  assert.deepEqual(state.componentPowerModes, {});
  assert.deepEqual(state.componentUnusedPinModes, {});
  assert.equal(state.workspaceMode, 'simulation');
  assert.equal(state.wiringMode, 'auto');
  assert.equal(state.showGrid, false);
  assert.equal(state.showMinimap, true);
  assert.equal(state.schematicTheme, 'light');
});

test('hydrateProject resets selection and undo/redo history to a clean baseline', () => {
  resetStore();
  useBoardStore.setState({
    componentPowerModes: { 'sensor-1': 'sleep' },
    componentUnusedPinModes: { 'sensor-1': { GPIO1: 'internal-pullup' } },
    selectedComponentId: 'sensor-1',
    canUndo: true,
    canRedo: true,
    pastHistoryEntries: [{
      beforeSignature: 'before',
      afterSignature: 'after',
      forward: {},
      reverse: {},
    }],
    futureHistoryEntries: [{
      beforeSignature: 'after',
      afterSignature: 'before',
      forward: {},
      reverse: {},
    }],
  });

  const result = useBoardStore.getState().hydrateProject({
    version: 3,
    savedAt: '2026-06-17T00:00:00.000Z',
    projectName: 'clean-import',
    activeBoardId: 'esp32',
    pins: getInitialPins('esp32'),
    components: [],
    manualConnections: [],
    installedLibraries: [],
    generatedCode: '',
    codeError: null,
    customComponentPackages: [],
    isGuestStudentMode: false,
    powerInputMode: 'ext-3v3',
    workspaceMode: 'schematic',
    wiringMode: 'manual',
    showGrid: true,
    showMinimap: false,
  });

  assert.equal(result.success, true);

  const state = useBoardStore.getState();
  assert.equal(state.selectedComponentId, null);
  assert.equal(state.pastHistoryEntries.length, 0);
  assert.equal(state.futureHistoryEntries.length, 0);
  assert.equal(state.canUndo, false);
  assert.equal(state.canRedo, false);
  assert.equal(state.activeBoardId, 'esp32');
  assert.deepEqual(state.componentPowerModes, {});
  assert.deepEqual(state.componentUnusedPinModes, {});
  assert.equal(state.workspaceMode, 'schematic');
  assert.equal(state.wiringMode, 'manual');
});

test('hydrateProject downgrades legacy pcb workspace imports into schematic in review-mvp surface', () => {
  resetStore();

  const result = useBoardStore.getState().hydrateProject({
    version: 3,
    savedAt: '2026-06-17T00:00:00.000Z',
    projectName: 'legacy-pcb',
    activeBoardId: 'uno',
    pins: getInitialPins('uno'),
    components: [],
    manualConnections: [],
    installedLibraries: [],
    generatedCode: '',
    codeError: null,
    customComponentPackages: [],
    isGuestStudentMode: false,
    powerInputMode: 'usb-5v',
    workspaceMode: 'pcb',
    wiringMode: 'auto',
    showGrid: true,
    showMinimap: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.notice, '리뷰 모드에서는 회로도/시뮬레이션만 사용할 수 있습니다.');
  assert.equal(useBoardStore.getState().workspaceMode, 'schematic');
});

test('hydrateProject normalizes legacy resistor ranges into concrete values on load', () => {
  resetStore();

  const result = useBoardStore.getState().hydrateProject({
    version: 3,
    savedAt: '2026-06-17T00:00:00.000Z',
    projectName: 'legacy-range',
    activeBoardId: 'uno',
    pins: getInitialPins('uno'),
    components: [
      {
        instanceId: 'res-1',
        templateId: 'tpl_resistor',
        name: '저항 1',
        value: '220-330 Ohm',
        position: { x: 180, y: 180 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
      },
      {
        instanceId: 'res-2',
        templateId: 'tpl_resistor',
        name: '저항 2',
        value: '4.7k-10k Ohm',
        position: { x: 320, y: 180 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
      },
    ],
    manualConnections: [],
    generatedCode: '',
    codeError: null,
    installedLibraries: [],
    customComponentPackages: [],
    isGuestStudentMode: false,
    powerInputMode: 'usb-5v',
    workspaceMode: 'simulation',
    wiringMode: 'auto',
    showGrid: true,
    showMinimap: true,
  });

  assert.equal(result.success, true);

  const state = useBoardStore.getState();
  assert.equal(state.components[0]?.value, '220 Ohm');
  assert.equal(state.components[1]?.value, '4.7k Ohm');
});

test('hydrateProject rejects non-object payloads without mutating the current project', () => {
  resetStore();
  const before = useBoardStore.getState().projectName;

  const result = useBoardStore.getState().hydrateProject(null);

  assert.equal(result.success, false);
  assert.equal(useBoardStore.getState().projectName, before);
});

test('hydrateProject salvages valid slices from a partially corrupted JSON document', () => {
  resetStore();

  const result = useBoardStore.getState().hydrateProject({
    version: 2,
    savedAt: '2025-02-14T10:20:30.000Z',
    projectName: 'field-recovery-demo',
    activeBoardId: 'uno',
    pins: 'not-even-an-object',
    components: [
      {
        instanceId: 'ok-sensor',
        templateId: 'tpl_dht11',
        name: '살릴 수 있는 센서',
        position: { x: 180, y: 120 },
        rotation: 90,
        assignedPins: {
          VCC: '5V',
          GND: 'GND',
          Data: 'D2',
          Broken: 999,
        },
        isFullyRouted: true,
      },
      {
        instanceId: 42,
        templateId: 'tpl_led',
      },
      'broken-component',
    ],
    manualConnections: [
      {
        id: 'recoverable-connection',
        source: { ownerType: 'component', ownerId: 'ok-sensor', pinId: 'Data' },
        target: { ownerType: 'board', ownerId: 'board-node', pinId: 'D2' },
        suggestedNetName: ' SENSOR__DATA ',
      },
      {
        id: 'broken-connection',
        source: { ownerType: 'component', ownerId: 'ok-sensor' },
        target: null,
      },
    ],
    generatedCode: 'void setup() {}\nvoid loop() {}',
    codeError: 123,
    customComponentPackages: [
      {
        version: '1.0.0',
        templateId: 'user_custom_tmp36',
        name: 'TMP36 커스텀',
        category: 'SENSOR',
        compatibleVoltage: 'BOTH',
        requiredPins: [
          { name: 'VCC', allowedTypes: ['POWER'] },
          { name: 'GND', allowedTypes: ['GND'] },
          { name: 'AOut', allowedTypes: ['ANALOG'] },
        ],
      },
      {
        version: '1.0.0',
        templateId: '',
        name: '깨진 패키지',
      },
    ],
    isGuestStudentMode: false,
    powerInputMode: 'ext-5v',
    workspaceMode: 'schematic',
    wiringMode: 'manual',
    showGrid: true,
    showMinimap: false,
  });

  assert.equal(result.success, true);

  const state = useBoardStore.getState();
  const defaultPins = getInitialPins('uno');

  assert.equal(state.projectName, 'field-recovery-demo');
  assert.deepEqual(Object.keys(state.pins).sort(), Object.keys(defaultPins).sort(), 'broken pins payload should fall back to board defaults');
  assert.equal(state.components.length, 1);
  assert.equal(state.components[0]?.instanceId, 'ok-sensor');
  assert.equal(state.components[0]?.rotation, 90);
  assert.deepEqual(state.components[0]?.assignedPins, {
    VCC: '5V',
    GND: 'GND',
    Data: 'D2',
  });
  assert.equal(state.manualConnections.length, 1);
  assert.equal(state.manualConnections[0]?.id, 'recoverable-connection');
  assert.equal(state.manualConnections[0]?.suggestedNetName, 'SENSOR__DATA');
  assert.equal(state.codeError, null);
  assert.equal(state.customComponentPackages.length, 1);
  assert.equal(state.customComponentPackages[0]?.templateId, 'user_custom_tmp36');
  assert.equal(state.powerInputMode, 'ext-5v');
  assert.equal(state.workspaceMode, 'schematic');
  assert.equal(state.wiringMode, 'manual');
  assert.equal(state.showGrid, true);
  assert.equal(state.showMinimap, false);
});
