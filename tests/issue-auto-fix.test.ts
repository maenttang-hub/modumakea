import test from 'node:test';
import assert from 'node:assert/strict';

import { getInitialPins } from '@/constants/board-pins';
import { buildIssueAutoFixInstruction } from '@/lib/issue-auto-fix';
import type { ProjectAuditIssue } from '@/types';

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
    savedAt: '2026-06-22T00:00:00.000Z',
    projectName: 'auto-fix-test',
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

test('buildIssueAutoFixInstruction returns pull-up actions for missing I2C pullups', () => {
  const issue: ProjectAuditIssue = {
    severity: 'error',
    title: 'I2C 풀업 저항 누락',
    message: 'SDA/SCL에 풀업 저항이 없습니다.',
    code: 'bus.i2c-impedance-voltage.missing-pullup',
    ruleId: 'bus.i2c-impedance-voltage',
    componentName: 'OLED1',
    visualTargets: {
      componentIds: ['oled-1'],
    },
  };

  const instruction = buildIssueAutoFixInstruction({
    issue,
    activeBoardId: 'uno',
    appLanguage: 'ko',
    components: [
      {
        instanceId: 'oled-1',
        templateId: 'tpl_oled_display_i2c',
        name: 'OLED1',
        value: '128x64',
        position: { x: 120, y: 80 },
        rotation: 0,
        assignedPins: {
          SDA: 'A4',
          SCL: 'A5',
          VCC: '5V',
          GND: 'GND',
        },
        isFullyRouted: true,
      },
    ],
  });

  assert.ok(instruction);
  assert.equal(instruction?.actions.length, 6);
  assert.deepEqual(
    instruction?.actions.filter(action => action.type === 'add_component').map(action => ({
      type: action.type,
      templateId: action.templateId,
      value: action.value,
    })),
    [
      { type: 'add_component', templateId: 'tpl_resistor', value: '4.7k' },
      { type: 'add_component', templateId: 'tpl_resistor', value: '4.7k' },
    ]
  );
  assert.deepEqual(
    instruction?.actions.filter(action => action.type === 'add_wire').map(action => [action.from, action.to]),
    [
      ['R_PULLUP_SDA:1', '5V'],
      ['R_PULLUP_SDA:2', 'A4'],
      ['R_PULLUP_SCL:1', '5V'],
      ['R_PULLUP_SCL:2', 'A5'],
    ]
  );
});

test('ghost auto-fix preview can be applied, committed, and cleared from the store', () => {
  resetStore('uno');

  const applyResult = useBoardStore.getState().applyGhostFix({
    issueId: 'bus.i2c-impedance-voltage.missing-pullup',
    explanation: 'I2C 버스에 풀업 저항이 필요합니다.',
    recommendation: '4.7k 저항을 추가하세요.',
    actions: [
      {
        type: 'add_component',
        componentId: 'R_PULLUP_SDA',
        templateId: 'tpl_resistor',
        value: '4.7k',
        position: { x: 180, y: 120 },
        name: 'SDA Pull-up',
      },
      { type: 'add_wire', from: 'R_PULLUP_SDA:1', to: '5V' },
      { type: 'add_wire', from: 'R_PULLUP_SDA:2', to: 'D2' },
    ],
  });

  assert.equal(applyResult.success, true);
  const previewState = useBoardStore.getState();
  assert.ok(previewState.ghostFixPreview);
  assert.equal(previewState.ghostFixPreview?.components.length, 1);
  assert.deepEqual(previewState.ghostFixPreview?.components[0]?.assignedPins, {
    '1': '5V',
    '2': 'D2',
  });

  const commitResult = useBoardStore.getState().commitGhostFix();
  assert.equal(commitResult.success, true);

  const committedState = useBoardStore.getState();
  assert.equal(committedState.ghostFixPreview, null);
  assert.equal(committedState.components.length, 1);
  assert.equal(committedState.components[0]?.templateId, 'tpl_resistor');
  assert.deepEqual(committedState.components[0]?.assignedPins, {
    '1': '5V',
    '2': 'D2',
  });

  const rollbackResult = useBoardStore.getState().applyGhostFix({
    issueId: 'netlist.decoupling-capacitor-missing',
    explanation: '디커플링 캐패시터를 추가합니다.',
    recommendation: '0.1uF를 붙이세요.',
    actions: [
      {
        type: 'add_component',
        componentId: 'C_DECOUPLE',
        templateId: 'tpl_capacitor',
        value: '0.1uF',
        position: { x: 220, y: 90 },
      },
    ],
  });

  assert.equal(rollbackResult.success, true);
  assert.ok(useBoardStore.getState().ghostFixPreview);
  useBoardStore.getState().rollbackGhostFix();
  assert.equal(useBoardStore.getState().ghostFixPreview, null);
});
