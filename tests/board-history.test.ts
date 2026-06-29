import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDefaultProjectState } from '@/store/store-defaults';
import {
  applyHistoryPatch,
  applyHistorySnapshot,
  buildHistorySnapshotSignature,
  createHistorySnapshot,
  withHistory,
  type HistoryTrackedState,
} from '@/store/board-history';
import type { PlacedComponent } from '@/types';

function buildTrackedState(overrides: Partial<HistoryTrackedState> = {}): HistoryTrackedState {
  const defaults = buildDefaultProjectState('uno');
  const selectedComponentId = overrides.selectedComponentId ?? null;
  const baseSnapshot = createHistorySnapshot({
    activeBoardId: overrides.activeBoardId ?? defaults.activeBoardId,
    pins: overrides.pins ?? defaults.pins,
    components: overrides.components ?? defaults.components,
    manualConnections: overrides.manualConnections ?? defaults.manualConnections,
    powerInputMode: overrides.powerInputMode ?? defaults.powerInputMode,
    componentPowerModes: overrides.componentPowerModes ?? defaults.componentPowerModes,
    componentUnusedPinModes: overrides.componentUnusedPinModes ?? defaults.componentUnusedPinModes,
    workspaceMode: overrides.workspaceMode ?? defaults.workspaceMode,
    wiringMode: overrides.wiringMode ?? defaults.wiringMode,
    showGrid: overrides.showGrid ?? defaults.showGrid,
    showMinimap: overrides.showMinimap ?? defaults.showMinimap,
    selectedComponentId,
  });

  return {
    activeBoardId: overrides.activeBoardId ?? defaults.activeBoardId,
    pins: overrides.pins ?? defaults.pins,
    components: overrides.components ?? defaults.components,
    manualConnections: overrides.manualConnections ?? defaults.manualConnections,
    powerInputMode: overrides.powerInputMode ?? defaults.powerInputMode,
    componentPowerModes: overrides.componentPowerModes ?? defaults.componentPowerModes,
    componentUnusedPinModes: overrides.componentUnusedPinModes ?? defaults.componentUnusedPinModes,
    workspaceMode: overrides.workspaceMode ?? defaults.workspaceMode,
    wiringMode: overrides.wiringMode ?? defaults.wiringMode,
    showGrid: overrides.showGrid ?? defaults.showGrid,
    showMinimap: overrides.showMinimap ?? defaults.showMinimap,
    selectedComponentId,
    pastHistoryEntries: overrides.pastHistoryEntries ?? [],
    futureHistoryEntries: overrides.futureHistoryEntries ?? [],
    historySignature: overrides.historySignature ?? buildHistorySnapshotSignature(baseSnapshot),
  };
}

test('history snapshot restores only used pin states back onto a clean board pin map', () => {
  const defaults = buildDefaultProjectState('uno');
  const pins = {
    ...defaults.pins,
    D2: {
      ...defaults.pins.D2,
      isUsed: true,
      connectedTo: 'sensor-1',
      assignmentMode: 'manual' as const,
    },
    A4: {
      ...defaults.pins.A4,
      isUsed: true,
      connectedTo: 'display-1',
      assignmentMode: 'auto' as const,
    },
  };

  const snapshot = createHistorySnapshot({
    ...defaults,
    pins,
    selectedComponentId: 'sensor-1',
  });

  const restored = applyHistorySnapshot(snapshot);
  const signature = buildHistorySnapshotSignature(snapshot);

  assert.match(signature, /pins:.*D2:1:sensor-1:manual;/);
  assert.match(signature, /pins:.*A4:1:display-1:auto;/);
  assert.equal(restored.pins.D2.isUsed, true);
  assert.equal(restored.pins.D2.connectedTo, 'sensor-1');
  assert.equal(restored.pins.D2.assignmentMode, 'manual');
  assert.equal(restored.pins.A4.isUsed, true);
  assert.equal(restored.pins.A4.connectedTo, 'display-1');
  assert.equal(restored.pins.A4.assignmentMode, 'auto');
  assert.equal(restored.pins.A0.isUsed, false);
});

test('history snapshot preserves component power mode selections', () => {
  const state = buildTrackedState({
    componentPowerModes: {
      'sensor-1': 'sleep',
      'display-1': 'display-full-on',
    },
  });

  const snapshot = createHistorySnapshot(state);
  const restored = applyHistorySnapshot(snapshot);
  const signature = buildHistorySnapshotSignature(snapshot);

  assert.match(signature, /modes:display-1:display-full-on;sensor-1:sleep;/);
  assert.deepEqual(restored.componentPowerModes, {
    'display-1': 'display-full-on',
    'sensor-1': 'sleep',
  });
});

test('history snapshot preserves component unused pin policies', () => {
  const state = buildTrackedState({
    componentUnusedPinModes: {
      'mcu-1': {
        GPIO12: 'internal-pulldown',
        GPIO13: 'floating-ok',
      },
    },
  });

  const snapshot = createHistorySnapshot(state);
  const restored = applyHistorySnapshot(snapshot);
  const signature = buildHistorySnapshotSignature(snapshot);

  assert.match(signature, /unused:mcu-1:\{GPIO12:internal-pulldown;GPIO13:floating-ok;\}/);
  assert.deepEqual(restored.componentUnusedPinModes, {
    'mcu-1': {
      GPIO12: 'internal-pulldown',
      GPIO13: 'floating-ok',
    },
  });
});

test('history snapshot is insulated from later component mutations', () => {
  const state = buildTrackedState({
    components: [{
      instanceId: 'sensor-1',
      templateId: 'tpl_dht11',
      name: '온습도 센서 1',
      value: 'DHT11',
      position: { x: 100, y: 120 },
      rotation: 0,
      assignedPins: { Data: 'D2' },
      isFullyRouted: true,
    }],
  });

  const snapshot = createHistorySnapshot(state);

  state.components[0]!.position.x = 240;
  state.components[0]!.assignedPins.Data = 'D3';

  assert.equal(snapshot.components[0]!.position.x, 100);
  assert.equal(snapshot.components[0]!.assignedPins.Data, 'D2');
});

test('withHistory skips duplicate snapshots instead of pushing another undo frame', () => {
  const state = buildTrackedState();
  const snapshot = createHistorySnapshot({
    activeBoardId: state.activeBoardId,
    pins: state.pins,
    components: state.components,
    manualConnections: state.manualConnections,
    powerInputMode: state.powerInputMode,
    workspaceMode: state.workspaceMode,
    wiringMode: state.wiringMode,
    showGrid: state.showGrid,
    showMinimap: state.showMinimap,
    selectedComponentId: state.selectedComponentId,
  });
  const nextState = { selectedComponentId: state.selectedComponentId };

  const result = withHistory(state, nextState, snapshot);

  assert.strictEqual(result, nextState);
  assert.equal(state.pastHistoryEntries.length, 0);
});

test('ui-only state changes do not create undo frames', () => {
  const state = buildTrackedState();
  const nextState = { showGrid: !state.showGrid };
  const snapshot = createHistorySnapshot({
    ...state,
    showGrid: !state.showGrid,
  });

  const result = withHistory(state, nextState, snapshot);

  assert.strictEqual(result, nextState);
  assert.equal(state.pastHistoryEntries.length, 0);
});

test('withHistory stores compact patch entries instead of full snapshot copies', () => {
  const state = buildTrackedState({
    components: [{
      instanceId: 'sensor-1',
      templateId: 'tpl_dht11',
      name: '온습도 센서 1',
      value: 'DHT11',
      position: { x: 100, y: 120 },
      rotation: 0,
      assignedPins: { Data: 'D2' },
      isFullyRouted: true,
    }],
  });

  const movedComponents = state.components.map(component =>
    component.instanceId === 'sensor-1'
      ? {
          ...component,
          position: { x: 145, y: 120 },
        }
      : component
  );
  const nextSnapshot = createHistorySnapshot({
    ...state,
    components: movedComponents,
  });

  const result = withHistory(state, { components: movedComponents }, nextSnapshot);
  const historyEntries = result.pastHistoryEntries ?? [];
  const futureEntries = result.futureHistoryEntries ?? [];
  const historyEntry = historyEntries[0];

  assert.equal(historyEntries.length, 1);
  assert.equal(futureEntries.length, 0);
  assert.equal(historyEntry?.forward.components?.upserts.length, 1);
  assert.equal(historyEntry?.forward.components?.removals.length, 0);
  assert.equal(historyEntry?.forward.components?.upserts[0]?.position.x, 145);
});

test('history patch omits stable order metadata when only values change', () => {
  const state = buildTrackedState({
    components: [{
      instanceId: 'sensor-1',
      templateId: 'tpl_dht11',
      name: '온습도 센서 1',
      value: 'DHT11',
      position: { x: 100, y: 120 },
      rotation: 0,
      assignedPins: { Data: 'D2' },
      isFullyRouted: true,
    }],
  });

  const movedComponents = state.components.map(component =>
    component.instanceId === 'sensor-1'
      ? {
          ...component,
          position: { x: 130, y: 120 },
        }
      : component
  );

  const result = withHistory(
    state,
    { components: movedComponents },
    createHistorySnapshot({ ...state, components: movedComponents })
  );
  const historyEntries = result.pastHistoryEntries ?? [];
  const historyEntry = historyEntries[0];
  assert.equal(historyEntry?.forward.components?.order, undefined);
});

test('applyHistoryPatch preserves unchanged entity references for patch-only updates', () => {
  const sensor: PlacedComponent = {
    instanceId: 'sensor-1',
    templateId: 'tpl_dht11',
    name: '온습도 센서 1',
    value: 'DHT11',
    position: { x: 100, y: 120 },
    rotation: 0,
    assignedPins: { Data: 'D2' },
    isFullyRouted: true,
  };
  const led: PlacedComponent = {
    instanceId: 'led-1',
    templateId: 'tpl_led',
    name: 'LED 1',
    value: undefined,
    position: { x: 180, y: 120 },
    rotation: 0,
    assignedPins: { Signal: 'D5', GND: 'GND' },
    isFullyRouted: true,
  };

  const state = buildTrackedState({
    components: [sensor, led],
  });
  const movedComponents = [sensor, { ...led, position: { x: 210, y: 120 } }];
  const result = withHistory(
    state,
    { components: movedComponents },
    createHistorySnapshot({ ...state, components: movedComponents })
  );
  const historyEntries = result.pastHistoryEntries ?? [];
  const historyEntry = historyEntries[0];
  const patch = historyEntry?.forward;

  assert.ok(patch);

  const applied = applyHistoryPatch(state, patch);
  assert.equal(applied.components[0], sensor);
  assert.notEqual(applied.components[1], led);
});
