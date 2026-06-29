import { getBoardById } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import type {
  ComponentTemplate,
  ManualNetConnection,
  ManualPadEndpoint,
  PinType,
  PlacedComponent,
  RequiredPin,
  SubCircuitPortMapping,
  SubCircuitTemplate,
} from '@/types';

export type SubCircuitPortSemanticGroup =
  | 'power'
  | 'ground'
  | 'bus'
  | 'analog'
  | 'output'
  | 'signal'
  | 'other';

export interface SubCircuitPortCandidate {
  key: string;
  internalEndpoint: ManualPadEndpoint;
  defaultPinName: string;
  allowedTypes: PinType[];
  sourceLabel: string;
  externalLabel?: string;
  isConnectedOutside: boolean;
  groupedSourceLabels: string[];
  groupedExternalLabels: string[];
  groupedInternalEndpoints: ManualPadEndpoint[];
  semanticGroup: SubCircuitPortSemanticGroup;
}

type FlattenedCircuit = {
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
};

type BoundaryCandidateSeed = {
  key: string;
  internalEndpoint: ManualPadEndpoint;
  defaultPinName: string;
  allowedTypes: PinType[];
  sourceLabel: string;
  externalLabel?: string;
  isConnectedOutside: boolean;
};

function cloneEndpoint(endpoint: ManualPadEndpoint): ManualPadEndpoint {
  return {
    ownerType: endpoint.ownerType,
    ownerId: endpoint.ownerId,
    pinId: endpoint.pinId,
  };
}

function prefixId(prefix: string, id: string) {
  return `${prefix}.${id}`;
}

function getRequiredPin(template: ComponentTemplate | undefined, pinId: string): RequiredPin | undefined {
  return template?.requiredPins.find(pin => pin.name === pinId);
}

function getBoardPinTypes(boardId: string, boardPinId: string): PinType[] {
  const board = getBoardById(boardId);
  return board.pinDefinitions.find(pin => pin.id === boardPinId)?.type ?? ['DIGITAL'];
}

function buildEndpointKey(endpoint: ManualPadEndpoint) {
  return `${endpoint.ownerId}:${endpoint.pinId}`;
}

function buildPortGroupLabel(labels: string[]) {
  if (labels.length <= 1) {
    return labels[0] ?? '내부 핀';
  }

  const [first, second] = labels;
  const remaining = labels.length - 2;
  return remaining > 0
    ? `${first}, ${second} 외 ${remaining}개`
    : `${first}, ${second}`;
}

function mergeAllowedTypes(left: PinType[], right: PinType[]) {
  return Array.from(new Set([...left, ...right])) as PinType[];
}

function detectSemanticGroup(
  pinNames: string[],
  allowedTypes: PinType[],
  sourceLabels: string[],
  externalLabels: string[]
): SubCircuitPortSemanticGroup {
  const normalized = [...pinNames, ...sourceLabels, ...externalLabels].join(' ').toUpperCase();

  if (allowedTypes.includes('POWER') || /\b(VCC|VDD|VIN|VBAT|3V3|5V|POWER|HV|LV|V\+)\b/.test(normalized)) {
    return 'power';
  }
  if (allowedTypes.includes('GND') || /\b(GND|GROUND|0V|V-)\b/.test(normalized)) {
    return 'ground';
  }
  if (/\b(SDA|SCL|MISO|MOSI|SCK|CLK|RX|TX|CS|SS|DIO|RST|XSHUT|GPIO1|TRIG|ECHO|DATA)\b/.test(normalized)) {
    return 'bus';
  }
  if (allowedTypes.includes('ANALOG') || /\b(AIN|AOUT|ANALOG)\b/.test(normalized)) {
    return 'analog';
  }
  if (allowedTypes.includes('PWM') || /\b(PWM|OUT|ENA|ENB|ENABLE|DRV)\b/.test(normalized)) {
    return 'output';
  }
  if (/\b(SIG|SIGNAL|IN|IO)\b/.test(normalized) || allowedTypes.includes('DIGITAL')) {
    return 'signal';
  }

  return 'other';
}

function getSemanticPriority(group: SubCircuitPortSemanticGroup) {
  switch (group) {
    case 'power':
      return 0;
    case 'ground':
      return 1;
    case 'bus':
      return 2;
    case 'analog':
      return 3;
    case 'output':
      return 4;
    case 'signal':
      return 5;
    default:
      return 6;
  }
}

function createSelectedEndpointGroups(
  selectedSet: Set<string>,
  manualConnections: ManualNetConnection[]
) {
  const parent = new Map<string, string>();

  const ensure = (key: string) => {
    if (!parent.has(key)) {
      parent.set(key, key);
    }
  };

  const find = (key: string): string => {
    ensure(key);
    const current = parent.get(key)!;
    if (current === key) {
      return key;
    }
    const root = find(current);
    parent.set(key, root);
    return root;
  };

  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent.set(rightRoot, leftRoot);
    }
  };

  for (const connection of manualConnections) {
    if (connection.source.ownerType !== 'component' || connection.target.ownerType !== 'component') {
      continue;
    }
    if (!selectedSet.has(connection.source.ownerId) || !selectedSet.has(connection.target.ownerId)) {
      continue;
    }

    union(buildEndpointKey(connection.source), buildEndpointKey(connection.target));
  }

  return {
    find,
    ensure,
  };
}

export function isSubCircuitTemplate(template: ComponentTemplate | undefined): template is SubCircuitTemplate {
  return Boolean(
    template &&
    template.isSubCircuit &&
    template.internalState &&
    Array.isArray(template.portMappings)
  );
}

export function collectSubCircuitPortCandidates(
  components: PlacedComponent[],
  selectedInstanceIds: string[],
  manualConnections: ManualNetConnection[],
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined = getTemplateById
) {
  const selectedSet = new Set(selectedInstanceIds);
  const groupedEndpoints = createSelectedEndpointGroups(selectedSet, manualConnections);
  const seeds = new Map<string, BoundaryCandidateSeed>();
  const componentById = new Map(components.map(component => [component.instanceId, component]));

  const upsertSeed = (seed: BoundaryCandidateSeed) => {
    const current = seeds.get(seed.key);
    if (!current) {
      seeds.set(seed.key, seed);
      return;
    }

    seeds.set(seed.key, {
      ...current,
      allowedTypes: mergeAllowedTypes(current.allowedTypes, seed.allowedTypes),
      externalLabel: current.externalLabel ?? seed.externalLabel,
      isConnectedOutside: current.isConnectedOutside || seed.isConnectedOutside,
    });
  };

  for (const component of components) {
    if (!selectedSet.has(component.instanceId)) {
      continue;
    }

    const template = resolveTemplate(component.templateId);
    if (!template) {
      continue;
    }

    for (const pin of template.requiredPins) {
      const key = `${component.instanceId}:${pin.name}`;
      upsertSeed({
        key,
        internalEndpoint: {
          ownerType: 'component',
          ownerId: component.instanceId,
          pinId: pin.name,
        },
        defaultPinName: pin.name.toUpperCase(),
        allowedTypes: pin.allowedTypes,
        sourceLabel: `${component.name}.${pin.name}`,
        isConnectedOutside: false,
      });

      const assignedBoardPin = component.assignedPins[pin.name];
      if (!assignedBoardPin) {
        continue;
      }

      upsertSeed({
        key,
        internalEndpoint: {
          ownerType: 'component',
          ownerId: component.instanceId,
          pinId: pin.name,
        },
        defaultPinName: pin.name.toUpperCase(),
        allowedTypes: mergeAllowedTypes(pin.allowedTypes, getBoardPinTypes(boardId, assignedBoardPin)),
        sourceLabel: `${component.name}.${pin.name}`,
        externalLabel: assignedBoardPin,
        isConnectedOutside: true,
      });
    }
  }

  for (const connection of manualConnections) {
    const sourceSelected = connection.source.ownerType === 'component' && selectedSet.has(connection.source.ownerId);
    const targetSelected = connection.target.ownerType === 'component' && selectedSet.has(connection.target.ownerId);

    if (sourceSelected === targetSelected) {
      continue;
    }

    const internal = sourceSelected ? connection.source : connection.target;
    const external = sourceSelected ? connection.target : connection.source;
    const template = resolveTemplate(
      components.find(component => component.instanceId === internal.ownerId)?.templateId ?? ''
    );
    const requirement = getRequiredPin(template, internal.pinId);
    const allowedTypes =
      external.ownerType === 'board'
        ? getBoardPinTypes(boardId, external.pinId)
        : requirement?.allowedTypes ?? ['DIGITAL'];
    const externalLabel =
      external.ownerType === 'board'
        ? external.pinId
        : `${componentById.get(external.ownerId)?.name ?? external.ownerId}.${external.pinId}`;
    const key = `${internal.ownerId}:${internal.pinId}`;

    upsertSeed({
      key,
      internalEndpoint: cloneEndpoint(internal),
      defaultPinName: internal.pinId.toUpperCase(),
      allowedTypes,
      sourceLabel: `${componentById.get(internal.ownerId)?.name ?? internal.ownerId}.${internal.pinId}`,
      externalLabel,
      isConnectedOutside: true,
    });
  }

  const grouped = new Map<string, SubCircuitPortCandidate>();

  for (const seed of seeds.values()) {
    const endpointKey = buildEndpointKey(seed.internalEndpoint);
    const groupKey = groupedEndpoints.find(endpointKey);
    const current = grouped.get(groupKey);

    if (!current) {
      groupedEndpoints.ensure(endpointKey);
      grouped.set(groupKey, {
        ...seed,
        key: groupKey,
        sourceLabel: seed.sourceLabel,
        groupedSourceLabels: [seed.sourceLabel],
        groupedExternalLabels: seed.externalLabel ? [seed.externalLabel] : [],
        groupedInternalEndpoints: [cloneEndpoint(seed.internalEndpoint)],
        semanticGroup: detectSemanticGroup(
          [seed.defaultPinName],
          seed.allowedTypes,
          [seed.sourceLabel],
          seed.externalLabel ? [seed.externalLabel] : []
        ),
      });
      continue;
    }

    const nextAllowedTypes = Array.from(new Set([...current.allowedTypes, ...seed.allowedTypes])) as PinType[];
    const nextSourceLabels = Array.from(new Set([...current.groupedSourceLabels, seed.sourceLabel])).sort((left, right) =>
      left.localeCompare(right)
    );
    const nextExternalLabels = Array.from(
      new Set([
        ...current.groupedExternalLabels,
        ...(seed.externalLabel ? [seed.externalLabel] : []),
      ])
    ).sort((left, right) => left.localeCompare(right));

    grouped.set(groupKey, {
      ...current,
      allowedTypes: nextAllowedTypes,
      sourceLabel: buildPortGroupLabel(nextSourceLabels),
      externalLabel: nextExternalLabels[0],
      groupedSourceLabels: nextSourceLabels,
      groupedExternalLabels: nextExternalLabels,
      groupedInternalEndpoints: [
        ...current.groupedInternalEndpoints,
        cloneEndpoint(seed.internalEndpoint),
      ],
      semanticGroup: detectSemanticGroup(
        [current.defaultPinName, seed.defaultPinName],
        nextAllowedTypes,
        nextSourceLabels,
        nextExternalLabels
      ),
    });
  }

  return Array.from(grouped.values()).sort((left, right) => {
    const semanticDiff = getSemanticPriority(left.semanticGroup) - getSemanticPriority(right.semanticGroup);
    if (semanticDiff !== 0) {
      return semanticDiff;
    }
    if (left.isConnectedOutside !== right.isConnectedOutside) {
      return left.isConnectedOutside ? -1 : 1;
    }
    return left.sourceLabel.localeCompare(right.sourceLabel);
  });
}

export function normalizeSubCircuitEditorState(
  state: {
    components: PlacedComponent[];
    manualConnections: ManualNetConnection[];
    portMappings: SubCircuitPortMapping[];
  },
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined = getTemplateById
) {
  const componentIds = new Set(state.components.map(component => component.instanceId));
  const manualConnections = state.manualConnections.filter(connection =>
    connection.source.ownerType === 'component' &&
    connection.target.ownerType === 'component' &&
    componentIds.has(connection.source.ownerId) &&
    componentIds.has(connection.target.ownerId)
  );

  const candidates = collectSubCircuitPortCandidates(
    state.components,
    Array.from(componentIds),
    manualConnections,
    boardId,
    resolveTemplate
  );
  const candidateKeys = new Set(
    candidates.flatMap(candidate =>
      candidate.groupedInternalEndpoints.map(endpoint => `${endpoint.ownerId}:${endpoint.pinId}`)
    )
  );

  const portMappings = state.portMappings
    .filter(port => candidateKeys.has(`${port.internalEndpoint.ownerId}:${port.internalEndpoint.pinId}`))
    .map(port => ({
      ...port,
      internalComponentName: state.components.find(component => component.instanceId === port.internalEndpoint.ownerId)?.name,
      internalPinLabel: port.internalEndpoint.pinId,
    }));

  return {
    components: state.components,
    manualConnections,
    portMappings,
    portCandidates: candidates,
  };
}

export function buildSubCircuitTemplate(args: {
  templateId: string;
  templateName: string;
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  ports: Array<{
    externalPinId: string;
    internalEndpoint: ManualPadEndpoint;
    allowedTypes: PinType[];
  }>;
}): SubCircuitTemplate {
  const portMappings: SubCircuitPortMapping[] = args.ports.map(port => ({
    externalPinId: port.externalPinId,
    internalEndpoint: cloneEndpoint(port.internalEndpoint),
    internalPinLabel: port.internalEndpoint.pinId,
    internalComponentName: args.components.find(component => component.instanceId === port.internalEndpoint.ownerId)?.name,
  }));

  return {
    id: args.templateId,
    name: args.templateName,
    category: 'PASSIVE',
    description: `${args.templateName} 서브서킷`,
    icon: 'Package',
    compatibleVoltage: 'BOTH',
    requiredPins: args.ports.map(port => ({
      name: port.externalPinId,
      allowedTypes: port.allowedTypes,
    })),
    librarySource: 'custom',
    simulation: { type: 'custom' },
    schematic: {
      symbol: 'subcircuit',
      referencePrefix: 'X',
    },
    pcb: {
      footprint: 'Module:SubCircuit_Virtual',
      packageType: 'VIRTUAL',
      manufacturable: false,
    },
    isSubCircuit: true,
    internalState: {
      components: args.components.map(component => ({
        ...component,
        assignedPins: {},
        isFullyRouted: true,
      })),
      manualConnections: args.manualConnections.map(connection => ({
        ...connection,
        source: cloneEndpoint(connection.source),
        target: cloneEndpoint(connection.target),
      })),
    },
    portMappings,
  };
}

export function flattenSubCircuitProject(
  components: PlacedComponent[],
  manualConnections: ManualNetConnection[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined = getTemplateById
): FlattenedCircuit {
  const flatComponents: PlacedComponent[] = [];
  const flatConnections: ManualNetConnection[] = [];

  const appendFlattenedComponent = (
    component: PlacedComponent,
    externalAssignedPins: Record<string, string>,
    externalManualConnections: ManualNetConnection[],
    path: string[]
  ) => {
    const template = resolveTemplate(component.templateId);
    if (!isSubCircuitTemplate(template)) {
      flatComponents.push({
        ...component,
        assignedPins: { ...externalAssignedPins, ...component.assignedPins },
      });
      flatConnections.push(...externalManualConnections);
      return;
    }

    if (path.includes(template.id)) {
      flatComponents.push({
        ...component,
        assignedPins: { ...externalAssignedPins, ...component.assignedPins },
      });
      flatConnections.push(...externalManualConnections);
      return;
    }

    const namespace = component.instanceId;
    const prefixedPortOwners = new Map<string, ManualPadEndpoint>();

    for (const internalComponent of template.internalState.components) {
      const prefixedId = prefixId(namespace, internalComponent.instanceId);
      const clone: PlacedComponent = {
        ...internalComponent,
        instanceId: prefixedId,
        assignedPins: {},
        isSubCircuitInstance: internalComponent.isSubCircuitInstance,
      };

      for (const port of template.portMappings) {
        if (port.internalEndpoint.ownerId !== internalComponent.instanceId) {
          continue;
        }

        prefixedPortOwners.set(
          `${port.internalEndpoint.ownerId}:${port.internalEndpoint.pinId}`,
          {
            ownerType: 'component',
            ownerId: prefixedId,
            pinId: port.internalEndpoint.pinId,
          }
        );

        const boardPin = component.assignedPins[port.externalPinId] ?? externalAssignedPins[port.externalPinId];
        if (boardPin) {
          clone.assignedPins[port.internalEndpoint.pinId] = boardPin;
        }
      }

      appendFlattenedComponent(clone, clone.assignedPins, [], [...path, template.id]);
    }

    for (const internalConnection of template.internalState.manualConnections) {
      flatConnections.push({
        ...internalConnection,
        id: prefixId(namespace, internalConnection.id),
        source: {
          ...internalConnection.source,
          ownerId: prefixId(namespace, internalConnection.source.ownerId),
        },
        target: {
          ...internalConnection.target,
          ownerId: prefixId(namespace, internalConnection.target.ownerId),
        },
      });
    }

    for (const connection of externalManualConnections) {
      const sourceKey = `${connection.source.ownerId}:${connection.source.pinId}`;
      const targetKey = `${connection.target.ownerId}:${connection.target.pinId}`;
      const mappedSource = connection.source.ownerId === component.instanceId ? prefixedPortOwners.get(sourceKey) : undefined;
      const mappedTarget = connection.target.ownerId === component.instanceId ? prefixedPortOwners.get(targetKey) : undefined;

      flatConnections.push({
        ...connection,
        source: mappedSource ? cloneEndpoint(mappedSource) : cloneEndpoint(connection.source),
        target: mappedTarget ? cloneEndpoint(mappedTarget) : cloneEndpoint(connection.target),
      });
    }
  };

  for (const component of components) {
    const externalManualConnections = manualConnections.filter(connection =>
      connection.source.ownerId === component.instanceId || connection.target.ownerId === component.instanceId
    );
    appendFlattenedComponent(component, component.assignedPins, externalManualConnections, []);
  }

  const dedupedConnections = new Map<string, ManualNetConnection>();
  for (const connection of flatConnections) {
    dedupedConnections.set(connection.id, connection);
  }

  return {
    components: flatComponents,
    manualConnections: Array.from(dedupedConnections.values()),
  };
}
