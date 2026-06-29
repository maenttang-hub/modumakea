import { v4 as uuidv4 } from 'uuid';
import { getTemplateById } from '@/constants/component-templates';
import { getLocalizedTemplateName } from '@/lib/catalog-i18n';
import type {
  AppLanguage,
  BoardPin,
  CompanionPartSuggestion,
  ComponentTemplate,
  ManualNetConnection,
  ManualPadEndpoint,
  PlacedComponent,
} from '@/types';
import { COMPANION_TEMPLATE_IDS, SHARED_PINS } from '@/store/store-config';

export function isComponentFullyRoutedWithManualConnections(
  component: PlacedComponent,
  template: ComponentTemplate,
  manualConnections: ManualNetConnection[]
) {
  return template.requiredPins.every(pin => {
    if (component.assignedPins[pin.name]) {
      return true;
    }

    return manualConnections.some(connection =>
      (connection.source.ownerType === 'component' &&
        connection.source.ownerId === component.instanceId &&
        connection.source.pinId === pin.name) ||
      (connection.target.ownerType === 'component' &&
        connection.target.ownerId === component.instanceId &&
        connection.target.pinId === pin.name)
    );
  });
}

export function applyManualRoutingCompletion(
  components: PlacedComponent[],
  manualConnections: ManualNetConnection[]
) {
  let nextComponents: PlacedComponent[] | null = null;

  for (let index = 0; index < components.length; index += 1) {
    const component = components[index]!;
    const template = getTemplateById(component.templateId);
    if (!template) {
      continue;
    }

    const isFullyRouted = isComponentFullyRoutedWithManualConnections(component, template, manualConnections);
    if (component.isFullyRouted === isFullyRouted) {
      continue;
    }

    if (!nextComponents) {
      nextComponents = components.slice();
    }

    nextComponents[index] = {
      ...component,
      isFullyRouted,
    };
  }

  return nextComponents ?? components;
}

export function replaceComponentById(
  components: PlacedComponent[],
  instanceId: string,
  updater: (component: PlacedComponent, index: number) => PlacedComponent
) {
  const targetIndex = components.findIndex(component => component.instanceId === instanceId);
  if (targetIndex < 0) {
    return components;
  }

  const currentComponent = components[targetIndex]!;
  const nextComponent = updater(currentComponent, targetIndex);
  if (nextComponent === currentComponent) {
    return components;
  }

  const nextComponents = components.slice();
  nextComponents[targetIndex] = nextComponent;
  return nextComponents;
}

export function appendItem<T>(
  items: T[],
  item: T
) {
  const nextItems = items.slice();
  nextItems.push(item);
  return nextItems;
}

export function appendItems<T>(
  items: T[],
  additions: T[]
) {
  if (additions.length === 0) {
    return items;
  }

  const nextItems = items.slice();
  nextItems.push(...additions);
  return nextItems;
}

export function removeComponentById(
  components: PlacedComponent[],
  instanceId: string
) {
  const targetIndex = components.findIndex(component => component.instanceId === instanceId);
  if (targetIndex < 0) {
    return components;
  }

  return [
    ...components.slice(0, targetIndex),
    ...components.slice(targetIndex + 1),
  ];
}

export function removeManualConnectionsForOwner(
  connections: ManualNetConnection[],
  instanceId: string
) {
  let hasMatch = false;

  for (const connection of connections) {
    if (connection.source.ownerId === instanceId || connection.target.ownerId === instanceId) {
      hasMatch = true;
      break;
    }
  }

  if (!hasMatch) {
    return connections;
  }

  return connections.filter(connection =>
    connection.source.ownerId !== instanceId &&
    connection.target.ownerId !== instanceId
  );
}

export function releaseBoardPinIfNeeded(
  instanceId: string,
  boardPinId: string | undefined,
  pins: Record<string, BoardPin>
) {
  if (!boardPinId || SHARED_PINS.has(boardPinId)) {
    return pins;
  }

  const boardPin = pins[boardPinId];
  if (!boardPin || boardPin.connectedTo !== instanceId) {
    return pins;
  }

  return {
    ...pins,
    [boardPinId]: {
      ...boardPin,
      isUsed: false,
      connectedTo: undefined,
      assignmentMode: undefined,
    },
  };
}

export function upsertBoardPin(
  pins: Record<string, BoardPin>,
  boardPinId: string,
  updater: (pin: BoardPin) => BoardPin
) {
  const currentPin = pins[boardPinId];
  if (!currentPin) {
    return pins;
  }

  const nextPin = updater(currentPin);
  if (nextPin === currentPin) {
    return pins;
  }

  return {
    ...pins,
    [boardPinId]: nextPin,
  };
}

export function mergeTemplateCacheEntries<T>(
  cache: Record<string, T>,
  entries: T[],
  getId: (entry: T) => string
) {
  if (entries.length === 0) {
    return cache;
  }

  let nextCache: Record<string, T> | null = null;

  for (const entry of entries) {
    const id = getId(entry);
    const currentValue = nextCache?.[id] ?? cache[id];
    if (currentValue === entry) {
      continue;
    }

    if (!nextCache) {
      nextCache = { ...cache };
    }
    nextCache[id] = entry;
  }

  return nextCache ?? cache;
}

export function snapToGridValue(value: number, grid = 15) {
  return Math.round(value / grid) * grid;
}

export function resolvePlacedComponentValue(
  template: ComponentTemplate,
  suggestedValue?: string
) {
  const rawValue = suggestedValue?.trim() || template.defaultValue?.trim() || '';
  if (!rawValue) {
    return undefined;
  }

  if (template.id !== 'tpl_resistor') {
    return rawValue;
  }

  const normalized = rawValue
    .toLowerCase()
    .replace(/ohms?/g, '')
    .replace(/\s+/g, '');

  if (/220[-~]330/.test(normalized)) {
    return '220 Ohm';
  }

  if (/2\.?2k[-~]10k/.test(normalized) || /4\.?7k[-~]10k/.test(normalized)) {
    return '4.7k Ohm';
  }

  return rawValue;
}

export function buildCompanionInsertionPlan(
  targetComponent: PlacedComponent,
  items: CompanionPartSuggestion[],
  existingComponents: PlacedComponent[],
  language: AppLanguage = 'ko'
) {
  const existingCountByTemplate = new Map<string, number>();
  for (const component of existingComponents) {
    existingCountByTemplate.set(component.templateId, (existingCountByTemplate.get(component.templateId) ?? 0) + 1);
  }

  const addedCountByTemplate = new Map<string, number>();
  const plannedComponents: PlacedComponent[] = [];
  let slotIndex = 0;

  for (const item of items) {
    const templateId = COMPANION_TEMPLATE_IDS[item.kind];
    if (!templateId) {
      continue;
    }

    const template = getTemplateById(templateId);
    if (!template) {
      continue;
    }

    for (let quantityIndex = 0; quantityIndex < item.quantity; quantityIndex += 1) {
      const column = slotIndex % 2;
      const row = Math.floor(slotIndex / 2);
      const position = {
        x: snapToGridValue(targetComponent.position.x + 220 + column * 135),
        y: snapToGridValue(targetComponent.position.y + row * 90),
      };
      const baseCount = existingCountByTemplate.get(templateId) ?? 0;
      const addedCount = (addedCountByTemplate.get(templateId) ?? 0) + 1;
      addedCountByTemplate.set(templateId, addedCount);

      plannedComponents.push({
        instanceId: uuidv4(),
        templateId,
        name: `${getLocalizedTemplateName(template, language)} ${baseCount + addedCount}`,
        value: resolvePlacedComponentValue(template, item.value),
        position,
        rotation: 0,
        assignedPins: {},
        isFullyRouted: false,
      });

      slotIndex += 1;
    }
  }

  return plannedComponents;
}

export function normalizeEndpoint(nodeId: string, pinId: string): ManualPadEndpoint {
  const normalizedPinId = pinId.replace(/__source$/, '');
  if (nodeId === 'board-node') {
    return {
      ownerType: 'board',
      ownerId: 'board-node',
      pinId: normalizedPinId,
    };
  }

  return {
    ownerType: 'component',
    ownerId: nodeId,
    pinId: normalizedPinId,
  };
}

export function endpointKey(endpoint: ManualPadEndpoint) {
  return `${endpoint.ownerType}:${endpoint.ownerId}:${endpoint.pinId}`;
}

export function connectionKey(source: ManualPadEndpoint, target: ManualPadEndpoint) {
  const left = endpointKey(source);
  const right = endpointKey(target);
  return [left, right].sort().join('::');
}
