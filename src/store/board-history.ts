import { getInitialPins } from '@/constants/board-pins';
import type {
  BoardPin,
  ManualNetConnection,
  PlacedComponent,
  ProjectComponentUnusedPinModes,
  ProjectComponentPowerModes,
  ProjectHistorySnapshot,
} from '@/types';

const HISTORY_LIMIT = 60;

type HistoryPinState = ProjectHistorySnapshot['pinStates'][number];

type HistoryEntityPatch<T> = {
  upserts: T[];
  removals: string[];
  order?: string[];
};

export type HistorySnapshot = ProjectHistorySnapshot;

export interface HistoryPatch {
  activeBoardId?: string;
  powerInputMode?: ProjectHistorySnapshot['powerInputMode'];
  componentPowerModes?: ProjectComponentPowerModes;
  componentUnusedPinModes?: ProjectComponentUnusedPinModes;
  pinStates?: HistoryEntityPatch<HistoryPinState>;
  components?: HistoryEntityPatch<PlacedComponent>;
  manualConnections?: HistoryEntityPatch<ManualNetConnection>;
}

export interface HistoryEntry {
  beforeSignature: string;
  afterSignature: string;
  forward: HistoryPatch;
  reverse: HistoryPatch;
}

export type CircuitHistoryPatch = Pick<HistoryPatch, 'components' | 'manualConnections'>;

export type HistoryTrackedState = {
  activeBoardId: string;
  pins: Record<string, BoardPin>;
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  powerInputMode: ProjectHistorySnapshot['powerInputMode'];
  componentPowerModes: ProjectComponentPowerModes;
  componentUnusedPinModes: ProjectComponentUnusedPinModes;
  workspaceMode: 'simulation' | 'schematic' | 'pcb' | 'manufacturing';
  wiringMode: 'auto' | 'manual';
  showGrid: boolean;
  showMinimap: boolean;
  selectedComponentId: string | null;
  pastHistoryEntries: HistoryEntry[];
  futureHistoryEntries: HistoryEntry[];
  historySignature: string;
};

type HistoryFlags = {
  canUndo: boolean;
  canRedo: boolean;
};

function buildAssignedPinsSignature(assignedPins: Record<string, string>) {
  let signature = '';

  for (const componentPin in assignedPins) {
    signature += `${componentPin}:${assignedPins[componentPin]}|`;
  }

  return signature;
}

function buildPinStateSignature(pinState: HistoryPinState) {
  return `${pinState.pinId}:1:${pinState.connectedTo ?? ''}:${pinState.assignmentMode ?? ''};`;
}

function buildPinStatesSignature(pinStates: HistorySnapshot['pinStates']) {
  let signature = '';

  for (const pinState of pinStates) {
    signature += buildPinStateSignature(pinState);
  }

  return signature;
}

function cloneComponentPowerModes(componentPowerModes: ProjectComponentPowerModes) {
  return Object.keys(componentPowerModes)
    .sort()
    .reduce<ProjectComponentPowerModes>((acc, instanceId) => {
      acc[instanceId] = componentPowerModes[instanceId]!;
      return acc;
    }, {});
}

function buildComponentPowerModesSignature(componentPowerModes: ProjectComponentPowerModes) {
  let signature = '';

  for (const instanceId of Object.keys(componentPowerModes).sort()) {
    signature += `${instanceId}:${componentPowerModes[instanceId]};`;
  }

  return signature;
}

function cloneComponentUnusedPinModes(componentUnusedPinModes: ProjectComponentUnusedPinModes) {
  return Object.keys(componentUnusedPinModes)
    .sort()
    .reduce<ProjectComponentUnusedPinModes>((acc, instanceId) => {
      const pinMap = componentUnusedPinModes[instanceId];
      if (!pinMap) {
        return acc;
      }

      acc[instanceId] = Object.keys(pinMap)
        .sort()
        .reduce<NonNullable<ProjectComponentUnusedPinModes[string]>>((pinAcc, pinId) => {
          const mode = pinMap[pinId];
          if (mode) {
            pinAcc[pinId] = mode;
          }
          return pinAcc;
        }, {});
      return acc;
    }, {});
}

function buildComponentUnusedPinModesSignature(componentUnusedPinModes: ProjectComponentUnusedPinModes) {
  let signature = '';

  for (const instanceId of Object.keys(componentUnusedPinModes).sort()) {
    const pinMap = componentUnusedPinModes[instanceId];
    if (!pinMap) {
      continue;
    }

    signature += `${instanceId}:{`;
    for (const pinId of Object.keys(pinMap).sort()) {
      signature += `${pinId}:${pinMap[pinId]};`;
    }
    signature += '}';
  }

  return signature;
}

export function createHistoryPinStates(pins: Record<string, BoardPin>) {
  const pinStates: HistorySnapshot['pinStates'] = [];

  for (const pinId in pins) {
    const pin = pins[pinId];
    if (!pin?.isUsed && !pin?.connectedTo && !pin?.assignmentMode) {
      continue;
    }

    pinStates.push({
      pinId: pin.id,
      connectedTo: pin.connectedTo,
      assignmentMode: pin.assignmentMode,
    });
  }

  return pinStates;
}

function restorePinsFromHistorySnapshot(snapshot: HistorySnapshot) {
  const pins = getInitialPins(snapshot.activeBoardId);

  for (const pinState of snapshot.pinStates) {
    const basePin = pins[pinState.pinId];
    if (!basePin) {
      continue;
    }

    pins[pinState.pinId] = {
      ...basePin,
      isUsed: true,
      connectedTo: pinState.connectedTo,
      assignmentMode: pinState.assignmentMode,
    };
  }

  return pins;
}

function buildComponentSignature(component: PlacedComponent) {
  return `${component.instanceId}:${component.templateId}:${component.name}:${component.value ?? ''}:${component.position.x}:${component.position.y}:${component.rotation}:${component.isFullyRouted ? 1 : 0}:${buildAssignedPinsSignature(component.assignedPins)};`;
}

function buildComponentsSignature(components: PlacedComponent[]) {
  let signature = '';

  for (const component of components) {
    signature += buildComponentSignature(component);
  }

  return signature;
}

function buildManualConnectionSignature(connection: ManualNetConnection) {
  return `${connection.id}:${connection.source.ownerType}:${connection.source.ownerId}:${connection.source.pinId}:${connection.target.ownerType}:${connection.target.ownerId}:${connection.target.pinId}:${connection.suggestedNetName ?? ''};`;
}

function buildManualConnectionsSignature(connections: ManualNetConnection[]) {
  let signature = '';

  for (const connection of connections) {
    signature += buildManualConnectionSignature(connection);
  }

  return signature;
}

function cloneHistoryPinState(pinState: HistoryPinState): HistoryPinState {
  return {
    pinId: pinState.pinId,
    connectedTo: pinState.connectedTo,
    assignmentMode: pinState.assignmentMode,
  };
}

function cloneHistoryComponents(components: PlacedComponent[]): PlacedComponent[] {
  return components.map(component => ({
    instanceId: component.instanceId,
    templateId: component.templateId,
    name: component.name,
    value: component.value,
    position: {
      x: component.position.x,
      y: component.position.y,
    },
    rotation: component.rotation,
    assignedPins: { ...component.assignedPins },
    isFullyRouted: component.isFullyRouted,
  }));
}

function cloneManualConnections(connections: ManualNetConnection[]): ManualNetConnection[] {
  return connections.map(connection => ({
    id: connection.id,
    source: { ...connection.source },
    target: { ...connection.target },
    suggestedNetName: connection.suggestedNetName,
  }));
}

function clonePatchComponents(components: PlacedComponent[]) {
  return cloneHistoryComponents(components);
}

function clonePatchConnections(connections: ManualNetConnection[]) {
  return cloneManualConnections(connections);
}

function cloneBoardPin(pin: BoardPin): BoardPin {
  return {
    ...pin,
  };
}

function hasEntityOrderChanged<T>(
  previous: T[],
  next: T[],
  getId: (item: T) => string
) {
  if (previous.length !== next.length) {
    return true;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (getId(previous[index]!) !== getId(next[index]!)) {
      return true;
    }
  }

  return false;
}

function buildEntityPatch<T>(params: {
  previous: T[];
  next: T[];
  getId: (item: T) => string;
  clone: (item: T) => T;
  getSignature: (item: T) => string;
}): HistoryEntityPatch<T> | undefined {
  const { previous, next, getId, clone, getSignature } = params;
  const previousMap = new Map(previous.map(item => [getId(item), item]));
  const nextMap = new Map(next.map(item => [getId(item), item]));
  const removals: string[] = [];
  const upserts: T[] = [];
  const orderChanged = hasEntityOrderChanged(previous, next, getId);

  for (const previousItem of previous) {
    const id = getId(previousItem);
    if (!nextMap.has(id)) {
      removals.push(id);
    }
  }

  for (const nextItem of next) {
    const id = getId(nextItem);
    const previousItem = previousMap.get(id);
    if (!previousItem || getSignature(previousItem) !== getSignature(nextItem)) {
      upserts.push(clone(nextItem));
    }
  }

  if (removals.length === 0 && upserts.length === 0) {
    return undefined;
  }

  return {
    upserts,
    removals,
    order: orderChanged ? next.map(getId) : undefined,
  };
}

function buildHistoryPatch(previous: HistorySnapshot, next: HistorySnapshot): HistoryPatch {
  const patch: HistoryPatch = {};

  if (previous.activeBoardId !== next.activeBoardId) {
    patch.activeBoardId = next.activeBoardId;
  }

  if (previous.powerInputMode !== next.powerInputMode) {
    patch.powerInputMode = next.powerInputMode;
  }

  if (
    buildComponentPowerModesSignature(previous.componentPowerModes ?? {}) !==
    buildComponentPowerModesSignature(next.componentPowerModes ?? {})
  ) {
    patch.componentPowerModes = cloneComponentPowerModes(next.componentPowerModes ?? {});
  }

  if (
    buildComponentUnusedPinModesSignature(previous.componentUnusedPinModes ?? {}) !==
    buildComponentUnusedPinModesSignature(next.componentUnusedPinModes ?? {})
  ) {
    patch.componentUnusedPinModes = cloneComponentUnusedPinModes(next.componentUnusedPinModes ?? {});
  }

  patch.pinStates = buildEntityPatch({
    previous: previous.pinStates,
    next: next.pinStates,
    getId: item => item.pinId,
    clone: cloneHistoryPinState,
    getSignature: buildPinStateSignature,
  });

  patch.components = buildEntityPatch({
    previous: previous.components,
    next: next.components,
    getId: item => item.instanceId,
    clone: component => clonePatchComponents([component])[0]!,
    getSignature: buildComponentSignature,
  });

  patch.manualConnections = buildEntityPatch({
    previous: previous.manualConnections,
    next: next.manualConnections,
    getId: item => item.id,
    clone: connection => clonePatchConnections([connection])[0]!,
    getSignature: buildManualConnectionSignature,
  });

  return patch;
}

export function buildCircuitHistoryPatch(params: {
  previous: Pick<HistoryTrackedState, 'components' | 'manualConnections'>;
  next: Pick<HistoryTrackedState, 'components' | 'manualConnections'>;
}): CircuitHistoryPatch | null {
  const { previous, next } = params;
  const patch: CircuitHistoryPatch = {};

  patch.components = buildEntityPatch({
    previous: previous.components,
    next: next.components,
    getId: item => item.instanceId,
    clone: component => clonePatchComponents([component])[0]!,
    getSignature: buildComponentSignature,
  });

  patch.manualConnections = buildEntityPatch({
    previous: previous.manualConnections,
    next: next.manualConnections,
    getId: item => item.id,
    clone: connection => clonePatchConnections([connection])[0]!,
    getSignature: buildManualConnectionSignature,
  });

  if (!patch.components && !patch.manualConnections) {
    return null;
  }

  return patch;
}

function applyEntityPatch<T>(params: {
  base: T[];
  patch?: HistoryEntityPatch<T>;
  getId: (item: T) => string;
  clone: (item: T) => T;
}): T[] {
  const { base, patch, getId, clone } = params;
  if (!patch) {
    return base;
  }

  const nextMap = new Map(base.map(item => [getId(item), item]));
  for (const removalId of patch.removals) {
    nextMap.delete(removalId);
  }

  for (const upsert of patch.upserts) {
    nextMap.set(getId(upsert), clone(upsert));
  }

  if (!patch.order) {
    let changed = false;
    const nextItems: T[] = [];
    for (const item of base) {
      const nextItem = nextMap.get(getId(item));
      if (!nextItem) {
        changed = true;
        continue;
      }

      if (nextItem !== item) {
        changed = true;
      }

      nextItems.push(nextItem);
    }

    return changed ? nextItems : base;
  }

  const nextItems = patch.order
    .map(id => nextMap.get(id))
    .filter((item): item is T => Boolean(item));

  if (
    nextItems.length === base.length &&
    nextItems.every((item, index) => item === base[index])
  ) {
    return base;
  }

  return nextItems;
}

function applyPinHistoryPatch(params: {
  activeBoardId: string;
  basePins: Record<string, BoardPin>;
  patch?: HistoryEntityPatch<HistoryPinState>;
  boardChanged: boolean;
}) {
  const { activeBoardId, basePins, patch, boardChanged } = params;
  if (!patch) {
    return basePins;
  }

  const cleanPins = boardChanged ? basePins : getInitialPins(activeBoardId);
  let nextPins = basePins;
  let changed = false;

  for (const removalId of patch.removals) {
    const cleanPin = cleanPins[removalId];
    const currentPin = nextPins[removalId];
    if (!cleanPin || !currentPin) {
      continue;
    }

    if (
      currentPin.isUsed !== cleanPin.isUsed ||
      currentPin.connectedTo !== cleanPin.connectedTo ||
      currentPin.assignmentMode !== cleanPin.assignmentMode
    ) {
      if (!changed) {
        nextPins = { ...nextPins };
        changed = true;
      }
      nextPins[removalId] = cloneBoardPin(cleanPin);
    }
  }

  for (const pinState of patch.upserts) {
    const basePin = nextPins[pinState.pinId] ?? cleanPins[pinState.pinId];
    if (!basePin) {
      continue;
    }

    if (
      basePin.isUsed === true &&
      basePin.connectedTo === pinState.connectedTo &&
      basePin.assignmentMode === pinState.assignmentMode
    ) {
      continue;
    }

    if (!changed) {
      nextPins = { ...nextPins };
      changed = true;
    }

    nextPins[pinState.pinId] = {
      ...cloneBoardPin(basePin),
      isUsed: true,
      connectedTo: pinState.connectedTo,
      assignmentMode: pinState.assignmentMode,
    };
  }

  return changed ? nextPins : basePins;
}

export function buildHistoryFlags(
  pastHistoryEntries: HistoryEntry[],
  futureHistoryEntries: HistoryEntry[]
): HistoryFlags {
  return {
    canUndo: pastHistoryEntries.length > 0,
    canRedo: futureHistoryEntries.length > 0,
  };
}

export function createHistorySnapshot(
  state: Pick<
    HistoryTrackedState,
    | 'activeBoardId'
    | 'pins'
    | 'components'
    | 'manualConnections'
    | 'powerInputMode'
    | 'workspaceMode'
    | 'wiringMode'
    | 'showGrid'
    | 'showMinimap'
    | 'selectedComponentId'
  > & {
    componentPowerModes?: ProjectComponentPowerModes;
    componentUnusedPinModes?: ProjectComponentUnusedPinModes;
  }
): HistorySnapshot {
  return {
    activeBoardId: state.activeBoardId,
    pinStates: createHistoryPinStates(state.pins),
    components: cloneHistoryComponents(state.components),
    manualConnections: cloneManualConnections(state.manualConnections),
    powerInputMode: state.powerInputMode,
    componentPowerModes: cloneComponentPowerModes(state.componentPowerModes ?? {}),
    componentUnusedPinModes: cloneComponentUnusedPinModes(state.componentUnusedPinModes ?? {}),
  };
}

export function buildHistorySnapshotSignature(snapshot: HistorySnapshot) {
  return [
    snapshot.activeBoardId,
    snapshot.powerInputMode,
    `modes:${buildComponentPowerModesSignature(snapshot.componentPowerModes ?? {})}`,
    `unused:${buildComponentUnusedPinModesSignature(snapshot.componentUnusedPinModes ?? {})}`,
    `pins:${buildPinStatesSignature(snapshot.pinStates)}`,
    `components:${buildComponentsSignature(snapshot.components)}`,
    `manual:${buildManualConnectionsSignature(snapshot.manualConnections)}`,
  ].join('||');
}

export function withHistory<T extends HistoryTrackedState>(
  state: T,
  nextState: Partial<T>,
  nextSnapshot: HistorySnapshot
) {
  const nextSignature = buildHistorySnapshotSignature(nextSnapshot);
  if (state.historySignature === nextSignature) {
    return nextState;
  }

  const currentSnapshot = createHistorySnapshot(state);
  const currentSignature = buildHistorySnapshotSignature(currentSnapshot);
  const nextEntry: HistoryEntry = {
    beforeSignature: currentSignature,
    afterSignature: nextSignature,
    forward: buildHistoryPatch(currentSnapshot, nextSnapshot),
    reverse: buildHistoryPatch(nextSnapshot, currentSnapshot),
  };

  const pastHistoryEntries = [...state.pastHistoryEntries, nextEntry].slice(-HISTORY_LIMIT);
  const futureHistoryEntries: HistoryEntry[] = [];

  return {
    ...nextState,
    pastHistoryEntries,
    futureHistoryEntries,
    historySignature: nextSignature,
    ...buildHistoryFlags(pastHistoryEntries, futureHistoryEntries),
  };
}

export function applyHistoryPatch(
  state: Pick<
    HistoryTrackedState,
    | 'activeBoardId'
    | 'pins'
    | 'components'
    | 'manualConnections'
    | 'powerInputMode'
    | 'componentPowerModes'
    | 'componentUnusedPinModes'
  >,
  patch: HistoryPatch
) {
  const nextActiveBoardId = patch.activeBoardId ?? state.activeBoardId;
  const boardChanged = nextActiveBoardId !== state.activeBoardId;
  const basePins = boardChanged
    ? getInitialPins(nextActiveBoardId)
    : state.pins;

  return {
    activeBoardId: nextActiveBoardId,
    pins: applyPinHistoryPatch({
      activeBoardId: nextActiveBoardId,
      basePins,
      patch: patch.pinStates,
      boardChanged,
    }),
    components: applyEntityPatch({
      base: state.components,
      patch: patch.components,
      getId: item => item.instanceId,
      clone: component => clonePatchComponents([component])[0]!,
    }),
    manualConnections: applyEntityPatch({
      base: state.manualConnections,
      patch: patch.manualConnections,
      getId: item => item.id,
      clone: connection => clonePatchConnections([connection])[0]!,
    }),
    powerInputMode: patch.powerInputMode ?? state.powerInputMode,
    componentPowerModes: patch.componentPowerModes ?? state.componentPowerModes,
    componentUnusedPinModes: patch.componentUnusedPinModes ?? state.componentUnusedPinModes,
  };
}

export function applyHistorySnapshot(snapshot: HistorySnapshot) {
  return {
    activeBoardId: snapshot.activeBoardId,
    pins: restorePinsFromHistorySnapshot(snapshot),
    components: cloneHistoryComponents(snapshot.components),
    manualConnections: cloneManualConnections(snapshot.manualConnections),
    powerInputMode: snapshot.powerInputMode,
    componentPowerModes: cloneComponentPowerModes(snapshot.componentPowerModes ?? {}),
    componentUnusedPinModes: cloneComponentUnusedPinModes(snapshot.componentUnusedPinModes ?? {}),
  };
}
