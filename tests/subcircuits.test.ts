import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeCircuitNetlist } from '@/lib/circuit-netlist';
import { collectSubCircuitPortCandidates, normalizeSubCircuitEditorState } from '@/lib/subcircuits';
import { getInitialPins } from '@/constants/board-pins';
import { getTemplateById } from '@/constants/component-templates';
import type { PlacedComponent } from '@/types';

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

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: globalThis,
  });
}

installLocalStorageMock();

const { useBoardStore } = await import('@/store/use-board-store');

function resetStore() {
  localStorage.clear();
  useBoardStore.getState().hydrateProject({
    version: 3,
    savedAt: '2026-06-18T00:00:00.000Z',
    projectName: 'subcircuit-test',
    activeBoardId: 'uno',
    pins: getInitialPins('uno'),
    components: [],
    manualConnections: [],
    generatedCode: '',
    codeError: null,
    customComponentPackages: [],
    isGuestStudentMode: false,
    powerInputMode: 'usb-5v',
    workspaceMode: 'simulation',
    wiringMode: 'manual',
    showGrid: true,
    showMinimap: true,
  });
}

test('createSubCircuitComponent compresses selected components into a reusable runtime template', () => {
  resetStore();

  useBoardStore.setState(state => ({
    ...state,
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
        position: { x: 630, y: 180 },
        rotation: 0,
        assignedPins: { GND: 'GND' },
        isFullyRouted: true,
      },
    ] as PlacedComponent[],
    manualConnections: [
      {
        id: 'conn-signal',
        source: { ownerType: 'component', ownerId: 'res-1', pinId: '2' },
        target: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
      },
    ],
    pins: {
      ...getInitialPins('uno'),
      D2: {
        ...getInitialPins('uno').D2,
        isUsed: true,
        connectedTo: 'res-1',
        assignmentMode: 'manual',
      },
      GND: {
        ...getInitialPins('uno').GND,
        isUsed: true,
        connectedTo: 'led-1',
        assignmentMode: 'manual',
      },
    },
  }));

  const result = useBoardStore.getState().createSubCircuitComponent(['res-1', 'led-1'], {
    templateName: 'LED Driver',
    ports: [
      {
        externalPinId: 'IN',
        internalEndpoint: { ownerType: 'component', ownerId: 'res-1', pinId: '1' },
        allowedTypes: ['DIGITAL', 'PWM'],
      },
      {
        externalPinId: 'GND',
        internalEndpoint: { ownerType: 'component', ownerId: 'led-1', pinId: 'GND' },
        allowedTypes: ['GND'],
      },
    ],
  });

  assert.equal(result.success, true);

  const state = useBoardStore.getState();
  assert.equal(state.components.length, 1);
  assert.equal(state.components[0]?.isSubCircuitInstance, true);
  assert.deepEqual(state.components[0]?.assignedPins, {
    IN: 'D2',
    GND: 'GND',
  });

  const templateId = state.components[0]!.templateId;
  const runtimeTemplate = state.templateCache[templateId];
  assert.ok(runtimeTemplate?.isSubCircuit);
  assert.equal(runtimeTemplate?.portMappings?.length, 2);
  assert.equal(runtimeTemplate?.internalState?.components.length, 2);
  assert.equal(state.manualConnections.length, 0);
});

test('subcircuit runtime templates survive serialize -> hydrate roundtrip', () => {
  resetStore();

  useBoardStore.setState(state => ({
    ...state,
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
        position: { x: 630, y: 180 },
        rotation: 0,
        assignedPins: { GND: 'GND' },
        isFullyRouted: true,
      },
    ] as PlacedComponent[],
    manualConnections: [
      {
        id: 'conn-signal',
        source: { ownerType: 'component', ownerId: 'res-1', pinId: '2' },
        target: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
      },
    ],
    pins: {
      ...getInitialPins('uno'),
      D2: {
        ...getInitialPins('uno').D2,
        isUsed: true,
        connectedTo: 'res-1',
        assignmentMode: 'manual',
      },
      GND: {
        ...getInitialPins('uno').GND,
        isUsed: true,
        connectedTo: 'led-1',
        assignmentMode: 'manual',
      },
    },
  }));

  const result = useBoardStore.getState().createSubCircuitComponent(['res-1', 'led-1'], {
    templateName: 'LED Driver',
    ports: [
      {
        externalPinId: 'IN',
        internalEndpoint: { ownerType: 'component', ownerId: 'res-1', pinId: '1' },
        allowedTypes: ['DIGITAL', 'PWM'],
      },
      {
        externalPinId: 'GND',
        internalEndpoint: { ownerType: 'component', ownerId: 'led-1', pinId: 'GND' },
        allowedTypes: ['GND'],
      },
    ],
  });

  assert.equal(result.success, true);

  const exported = useBoardStore.getState().serializeProject();
  const templateId = exported.components[0]!.templateId;

  resetStore();
  const hydrated = useBoardStore.getState().hydrateProject(exported);
  assert.equal(hydrated.success, true);

  const state = useBoardStore.getState();
  assert.equal(state.components[0]?.templateId, templateId);
  assert.equal(state.templateCache[templateId]?.isSubCircuit, true);
  assert.equal(state.templateCache[templateId]?.internalState?.components.length, 2);
});

test('circuit analysis flattens subcircuit instances before solving', () => {
  resetStore();

  useBoardStore.setState(state => ({
    ...state,
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
        position: { x: 630, y: 180 },
        rotation: 0,
        assignedPins: { GND: 'GND' },
        isFullyRouted: true,
      },
    ] as PlacedComponent[],
    manualConnections: [
      {
        id: 'conn-signal',
        source: { ownerType: 'component', ownerId: 'res-1', pinId: '2' },
        target: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
      },
    ],
    pins: {
      ...getInitialPins('uno'),
      D2: {
        ...getInitialPins('uno').D2,
        isUsed: true,
        connectedTo: 'res-1',
        assignmentMode: 'manual',
      },
      GND: {
        ...getInitialPins('uno').GND,
        isUsed: true,
        connectedTo: 'led-1',
        assignmentMode: 'manual',
      },
    },
  }));

  const result = useBoardStore.getState().createSubCircuitComponent(['res-1', 'led-1'], {
    templateName: 'LED Driver',
    ports: [
      {
        externalPinId: 'IN',
        internalEndpoint: { ownerType: 'component', ownerId: 'res-1', pinId: '1' },
        allowedTypes: ['DIGITAL', 'PWM'],
      },
      {
        externalPinId: 'GND',
        internalEndpoint: { ownerType: 'component', ownerId: 'led-1', pinId: 'GND' },
        allowedTypes: ['GND'],
      },
    ],
  });

  assert.equal(result.success, true);

  const state = useBoardStore.getState();
  const analysis = analyzeCircuitNetlist(state.components, 'uno', getTemplateById, state.manualConnections);

  assert.equal(analysis.resistors.length, 1);
  assert.ok(analysis.diodes?.some(diode => diode.kind === 'led'));
});

test('collectSubCircuitPortCandidates groups boundary pins that already share one internal net', () => {
  const candidates = collectSubCircuitPortCandidates(
    [
      {
        instanceId: 'res-1',
        templateId: 'tpl_resistor',
        name: '저항 1',
        value: '220 Ohm',
        position: { x: 420, y: 180 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: true,
      },
      {
        instanceId: 'led-1',
        templateId: 'tpl_led',
        name: 'LED 1',
        value: 'green',
        position: { x: 630, y: 180 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: true,
      },
      {
        instanceId: 'sensor-1',
        templateId: 'tpl_dht11',
        name: '온습도 센서 1',
        value: undefined,
        position: { x: 820, y: 160 },
        rotation: 0,
        assignedPins: { DATA: 'D4' },
        isFullyRouted: true,
      },
    ],
    ['res-1', 'led-1'],
    [
      {
        id: 'internal',
        source: { ownerType: 'component', ownerId: 'res-1', pinId: '2' },
        target: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
      },
      {
        id: 'boundary-a',
        source: { ownerType: 'component', ownerId: 'res-1', pinId: '2' },
        target: { ownerType: 'component', ownerId: 'sensor-1', pinId: 'DATA' },
      },
      {
        id: 'boundary-b',
        source: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
        target: { ownerType: 'board', ownerId: 'board-node', pinId: 'D4' },
      },
    ],
    'uno',
    getTemplateById
  );

  const boundaryCandidate = candidates.find(candidate => candidate.groupedExternalLabels.includes('D4'));
  assert.ok(boundaryCandidate);
  assert.equal(boundaryCandidate.groupedSourceLabels.length, 2);
  assert.equal(candidates.some(candidate => candidate.sourceLabel === '저항 1.1'), true);
  assert.equal(candidates.some(candidate => candidate.sourceLabel === 'LED 1.GND'), true);
});

test('collectSubCircuitPortCandidates also suggests internal-only nets from the full selected structure', () => {
  const candidates = collectSubCircuitPortCandidates(
    [
      {
        instanceId: 'res-1',
        templateId: 'tpl_resistor',
        name: '저항 1',
        value: '220 Ohm',
        position: { x: 420, y: 180 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: true,
      },
      {
        instanceId: 'led-1',
        templateId: 'tpl_led',
        name: 'LED 1',
        value: 'green',
        position: { x: 630, y: 180 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: true,
      },
    ],
    ['res-1', 'led-1'],
    [
      {
        id: 'internal',
        source: { ownerType: 'component', ownerId: 'res-1', pinId: '2' },
        target: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
      },
    ],
    'uno',
    getTemplateById
  );

  assert.deepEqual(
    new Set(candidates.map(candidate => candidate.sourceLabel)),
    new Set(['LED 1.GND', '저항 1.1', 'LED 1.Signal, 저항 1.2'])
  );
  const groupedCandidate = candidates.find(candidate => candidate.groupedSourceLabels.length === 2);
  assert.ok(groupedCandidate);
  assert.equal(candidates.every(candidate => candidate.allowedTypes.length > 0), true);
});

test('collectSubCircuitPortCandidates sorts semantic groups ahead of generic signals', () => {
  const candidates = collectSubCircuitPortCandidates(
    [
      {
        instanceId: 'driver-1',
        templateId: 'tpl_driver_ic',
        name: '드라이버 IC 1',
        value: 'ULN2003',
        position: { x: 420, y: 180 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: true,
      },
    ],
    ['driver-1'],
    [],
    'uno',
    getTemplateById
  );

  assert.equal(candidates[0]?.semanticGroup, 'power');
  assert.equal(candidates[1]?.semanticGroup, 'ground');
  assert.ok(candidates.find(candidate => candidate.defaultPinName === 'OUT'));
});

test('normalizeSubCircuitEditorState drops stale port mappings and connections after internal deletion', () => {
  const normalized = normalizeSubCircuitEditorState(
    {
      components: [
        {
          instanceId: 'res-1',
          templateId: 'tpl_resistor',
          name: '저항 1',
          value: '220 Ohm',
          position: { x: 420, y: 180 },
          rotation: 0,
          assignedPins: {},
          isFullyRouted: true,
        },
      ] as PlacedComponent[],
      manualConnections: [
        {
          id: 'stale-link',
          source: { ownerType: 'component', ownerId: 'res-1', pinId: '1' },
          target: { ownerType: 'component', ownerId: 'missing-led', pinId: 'Signal' },
        },
      ],
      portMappings: [
        {
          externalPinId: 'OUT',
          internalEndpoint: { ownerType: 'component', ownerId: 'missing-led', pinId: 'Signal' },
          internalComponentName: 'LED 1',
          internalPinLabel: 'Signal',
        },
      ],
    },
    'uno',
    getTemplateById
  );

  assert.equal(normalized.manualConnections.length, 0);
  assert.equal(normalized.portMappings.length, 0);
  assert.ok(normalized.portCandidates.some(candidate => candidate.internalEndpoint.ownerId === 'res-1'));
});

test('updating a subcircuit template syncs all placed instances to the edited internal circuit', () => {
  resetStore();

  useBoardStore.setState(state => ({
    ...state,
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
        position: { x: 630, y: 180 },
        rotation: 0,
        assignedPins: { GND: 'GND' },
        isFullyRouted: true,
      },
    ] as PlacedComponent[],
    manualConnections: [
      {
        id: 'conn-signal',
        source: { ownerType: 'component', ownerId: 'res-1', pinId: '2' },
        target: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
      },
    ],
    pins: {
      ...getInitialPins('uno'),
      D2: {
        ...getInitialPins('uno').D2,
        isUsed: true,
        connectedTo: 'res-1',
        assignmentMode: 'manual',
      },
      GND: {
        ...getInitialPins('uno').GND,
        isUsed: true,
        connectedTo: 'led-1',
        assignmentMode: 'manual',
      },
    },
  }));

  const created = useBoardStore.getState().createSubCircuitComponent(['res-1', 'led-1'], {
    templateName: 'LED Driver',
    ports: [
      {
        externalPinId: 'IN',
        internalEndpoint: { ownerType: 'component', ownerId: 'res-1', pinId: '1' },
        allowedTypes: ['DIGITAL', 'PWM'],
      },
      {
        externalPinId: 'GND',
        internalEndpoint: { ownerType: 'component', ownerId: 'led-1', pinId: 'GND' },
        allowedTypes: ['GND'],
      },
    ],
  });

  assert.equal(created.success, true);

  const firstInstance = useBoardStore.getState().components[0]!;
  useBoardStore.setState(state => ({
    ...state,
    components: [
      ...state.components,
      {
        ...firstInstance,
        instanceId: 'subckt-2',
        name: 'LED Driver 2',
        assignedPins: {
          IN: 'D3',
          GND: 'GND',
        },
      },
    ] as PlacedComponent[],
  }));

  const templateId = firstInstance.templateId;
  const template = useBoardStore.getState().templateCache[templateId];
  assert.ok(template && 'internalState' in template);

  const updateResult = useBoardStore.getState().updateSubCircuitTemplate(templateId, {
    internalState: {
      components: template!.internalState!.components.map(component =>
        component.templateId === 'tpl_resistor'
          ? {
              ...component,
              value: '330 Ohm',
              position: { x: component.position.x + 45, y: component.position.y + 15 },
            }
          : component
      ),
      manualConnections: template!.internalState!.manualConnections,
    },
    portMappings: template!.portMappings!,
  });

  assert.equal(updateResult.success, true);

  const state = useBoardStore.getState();
  const updatedTemplate = state.templateCache[templateId];
  assert.equal(updatedTemplate?.internalState?.components.find(component => component.templateId === 'tpl_resistor')?.value, '330 Ohm');

  const analysis = analyzeCircuitNetlist(state.components, 'uno', getTemplateById, state.manualConnections);
  assert.equal(analysis.resistors.length, 2);
  assert.deepEqual(
    analysis.resistors.map(resistor => resistor.resistanceOhms).sort((left, right) => left - right),
    [330, 330]
  );
});

test('updating a subcircuit template can add, remove, and rename external ports while migrating instance wiring', () => {
  resetStore();

  useBoardStore.setState(state => ({
    ...state,
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
        position: { x: 630, y: 180 },
        rotation: 0,
        assignedPins: { GND: 'GND' },
        isFullyRouted: true,
      },
      {
        instanceId: 'sensor-1',
        templateId: 'tpl_dht11',
        name: '온습도 센서 1',
        value: undefined,
        position: { x: 820, y: 160 },
        rotation: 0,
        assignedPins: {},
        isFullyRouted: true,
      },
    ] as PlacedComponent[],
    manualConnections: [
      {
        id: 'conn-signal',
        source: { ownerType: 'component', ownerId: 'res-1', pinId: '2' },
        target: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
      },
      {
        id: 'sensor-link',
        source: { ownerType: 'component', ownerId: 'sensor-1', pinId: 'DATA' },
        target: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
      },
    ],
    pins: {
      ...getInitialPins('uno'),
      D2: {
        ...getInitialPins('uno').D2,
        isUsed: true,
        connectedTo: 'res-1',
        assignmentMode: 'manual',
      },
      GND: {
        ...getInitialPins('uno').GND,
        isUsed: true,
        connectedTo: 'led-1',
        assignmentMode: 'manual',
      },
    },
  }));

  const created = useBoardStore.getState().createSubCircuitComponent(['res-1', 'led-1'], {
    templateName: 'LED Driver',
    ports: [
      {
        externalPinId: 'IN',
        internalEndpoint: { ownerType: 'component', ownerId: 'res-1', pinId: '1' },
        allowedTypes: ['DIGITAL', 'PWM'],
      },
      {
        externalPinId: 'GND',
        internalEndpoint: { ownerType: 'component', ownerId: 'led-1', pinId: 'GND' },
        allowedTypes: ['GND'],
      },
      {
        externalPinId: 'OUT',
        internalEndpoint: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
        allowedTypes: ['DIGITAL', 'PWM'],
      },
    ],
  });

  assert.equal(created.success, true);

  const instance = useBoardStore.getState().components[1]!;
  useBoardStore.setState(state => ({
    ...state,
    manualConnections: [
      ...state.manualConnections,
      {
        id: 'instance-sense',
        source: { ownerType: 'component', ownerId: 'sensor-1', pinId: 'DATA' },
        target: { ownerType: 'component', ownerId: instance.instanceId, pinId: 'OUT' },
      },
    ],
  }));

  const templateId = instance.templateId;
  const template = useBoardStore.getState().templateCache[templateId]!;
  const updateResult = useBoardStore.getState().updateSubCircuitTemplate(templateId, {
    internalState: template.internalState!,
    portMappings: [
      {
        externalPinId: 'SIG_IN',
        internalEndpoint: { ownerType: 'component', ownerId: 'res-1', pinId: '1' },
      },
      {
        externalPinId: 'OUT',
        internalEndpoint: { ownerType: 'component', ownerId: 'led-1', pinId: 'Signal' },
      },
      {
        externalPinId: 'LED_GND',
        internalEndpoint: { ownerType: 'component', ownerId: 'led-1', pinId: 'GND' },
      },
    ],
  });

  assert.equal(updateResult.success, true);

  const nextState = useBoardStore.getState();
  const nextTemplate = nextState.templateCache[templateId]!;
  assert.deepEqual(
    nextTemplate.requiredPins.map(pin => pin.name),
    ['SIG_IN', 'OUT', 'LED_GND']
  );

  const migratedInstance = nextState.components.find(component => component.instanceId === instance.instanceId)!;
  assert.deepEqual(migratedInstance.assignedPins, {
    SIG_IN: 'D2',
    LED_GND: 'GND',
  });

  const migratedManualConnection = nextState.manualConnections.find(connection => connection.id === 'instance-sense');
  assert.equal(migratedManualConnection?.target.pinId, 'OUT');
  assert.equal(nextState.pins.D2.connectedTo, migratedInstance.instanceId);
  assert.equal(nextState.pins.GND.connectedTo, migratedInstance.instanceId);
});
