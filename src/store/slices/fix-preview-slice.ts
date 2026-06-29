import { v4 as uuidv4 } from 'uuid';
import type { StateCreator } from 'zustand';
import { getTemplateById } from '@/constants/component-templates';
import { getLocalizedTemplateName } from '@/lib/catalog-i18n';
import { createHistorySnapshot, withHistory } from '@/store/board-history';
import { applyManualRoutingCompletion, appendItems, removeComponentById } from '@/store/store-helpers';
import type { BoardStoreState } from '@/store/store-types';
import type { AutoFixAction, GhostFixPreview, ManualNetConnection, ManualPadEndpoint, PlacedComponent } from '@/types';

function parseEndpointToken(
  token: string,
  ghostComponentIds: Map<string, string>,
  stateComponents: PlacedComponent[],
  activeBoardId: string
): ManualPadEndpoint | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes(':')) {
    const [rawComponentId, rawPinId] = trimmed.split(':');
    const componentId = rawComponentId?.trim();
    const pinId = rawPinId?.trim();
    if (!componentId || !pinId) {
      return null;
    }

    const ghostOwnerId = ghostComponentIds.get(componentId);
    if (ghostOwnerId) {
      return {
        ownerType: 'component',
        ownerId: ghostOwnerId,
        pinId,
      };
    }

    const existing = stateComponents.find(component => component.instanceId === componentId || component.name === componentId);
    if (!existing) {
      return null;
    }

    return {
      ownerType: 'component',
      ownerId: existing.instanceId,
      pinId,
    };
  }

  return {
    ownerType: 'board',
    ownerId: activeBoardId,
    pinId: trimmed,
  };
}

function cloneGhostComponent(component: PlacedComponent): PlacedComponent {
  return {
    ...component,
    position: { ...component.position },
    assignedPins: { ...component.assignedPins },
  };
}

function cloneGhostConnection(connection: ManualNetConnection): ManualNetConnection {
  return {
    ...connection,
    source: { ...connection.source },
    target: { ...connection.target },
  };
}

function buildGhostPreview(
  actions: AutoFixAction[],
  state: BoardStoreState
): { preview: GhostFixPreview; error?: string } {
  const ghostComponents: PlacedComponent[] = [];
  const ghostComponentIds = new Map<string, string>();

  for (const action of actions) {
    if (action.type !== 'add_component') {
      continue;
    }

    const template = getTemplateById(action.templateId);
    if (!template) {
      return {
        error: `자동 수정용 템플릿을 찾지 못했습니다: ${action.templateId}`,
        preview: {
          issueId: '',
          explanation: '',
          recommendation: '',
          actions,
          components: [],
          manualConnections: [],
        },
      };
    }

    const ghostInstanceId = `ghost:${action.componentId}`;
    ghostComponentIds.set(action.componentId, ghostInstanceId);
    ghostComponents.push({
      instanceId: ghostInstanceId,
      templateId: template.id,
      name:
        action.name?.trim() ||
        `${getLocalizedTemplateName(template, state.appLanguage)} (AI)`,
      value: action.value ?? template.defaultValue,
      position: { ...action.position },
      rotation: action.rotation ?? 0,
      assignedPins: {},
      isFullyRouted: false,
    });
  }

  const nextConnections: ManualNetConnection[] = [];
  const componentById = new Map(ghostComponents.map(component => [component.instanceId, component]));

  for (const action of actions) {
    if (action.type !== 'add_wire') {
      continue;
    }

    const from = parseEndpointToken(action.from, ghostComponentIds, state.components, state.activeBoardId);
    const to = parseEndpointToken(action.to, ghostComponentIds, state.components, state.activeBoardId);
    if (!from || !to) {
      return {
        error: `자동 수정 배선 대상을 해석하지 못했습니다: ${action.from} -> ${action.to}`,
        preview: {
          issueId: '',
          explanation: '',
          recommendation: '',
          actions,
          components: [],
          manualConnections: [],
        },
      };
    }

    if (from.ownerType === 'component' && to.ownerType === 'board') {
      const component = componentById.get(from.ownerId);
      if (component) {
        component.assignedPins[from.pinId] = to.pinId;
        continue;
      }
    }

    if (from.ownerType === 'board' && to.ownerType === 'component') {
      const component = componentById.get(to.ownerId);
      if (component) {
        component.assignedPins[to.pinId] = from.pinId;
        continue;
      }
    }

    nextConnections.push({
      id: action.id ?? `ghost-wire:${action.from}->${action.to}`,
      source: from,
      target: to,
      suggestedNetName: action.suggestedNetName,
    });
  }

  const routedGhostComponents = applyManualRoutingCompletion(
    ghostComponents.map(cloneGhostComponent),
    nextConnections
  );

  return {
    preview: {
      issueId: '',
      explanation: '',
      recommendation: '',
      actions,
      components: routedGhostComponents,
      manualConnections: nextConnections.map(cloneGhostConnection),
    },
  };
}

export const createFixPreviewSlice: StateCreator<BoardStoreState, [], [], Partial<BoardStoreState>> = (set, get) => ({
  applyGhostFix: instruction => {
    const built = buildGhostPreview(instruction.actions, get());
    if (built.error) {
      return { success: false, error: built.error };
    }

    set({
      ghostFixPreview: {
        ...built.preview,
        issueId: instruction.issueId,
        explanation: instruction.explanation,
        recommendation: instruction.recommendation,
      },
    });

    return { success: true };
  },

  commitGhostFix: () => {
    const state = get();
    const preview = state.ghostFixPreview;
    if (!preview) {
      return { success: false, error: '적용할 미리보기 수정안이 없습니다.' };
    }

    const nextIdMap = new Map<string, string>();
    for (const component of preview.components) {
      nextIdMap.set(component.instanceId, uuidv4());
    }

    let nextComponents = state.components.slice();
    let nextManualConnections = state.manualConnections.slice();

    for (const action of preview.actions) {
      if (action.type === 'remove_component') {
        nextComponents = removeComponentById(nextComponents, action.componentId);
      }

      if (action.type === 'remove_wire' && action.connectionId) {
        nextManualConnections = nextManualConnections.filter(connection => connection.id !== action.connectionId);
      }
    }

    const committedComponents = preview.components.map(component => ({
      ...component,
      instanceId: nextIdMap.get(component.instanceId) ?? component.instanceId,
      position: { ...component.position },
      assignedPins: { ...component.assignedPins },
    }));

    const committedConnections = preview.manualConnections.map(connection => ({
      ...connection,
      id: connection.id.startsWith('ghost-wire:') ? uuidv4() : connection.id,
      source: {
        ...connection.source,
        ownerId:
          connection.source.ownerType === 'component'
            ? (nextIdMap.get(connection.source.ownerId) ?? connection.source.ownerId)
            : connection.source.ownerId,
      },
      target: {
        ...connection.target,
        ownerId:
          connection.target.ownerType === 'component'
            ? (nextIdMap.get(connection.target.ownerId) ?? connection.target.ownerId)
            : connection.target.ownerId,
      },
    }));

    nextComponents = appendItems(nextComponents, committedComponents);
    nextManualConnections = appendItems(nextManualConnections, committedConnections);
    nextComponents = applyManualRoutingCompletion(nextComponents, nextManualConnections);

    set(currentState => withHistory(
      currentState,
      {
        components: nextComponents,
        manualConnections: nextManualConnections,
        ghostFixPreview: null,
      },
      createHistorySnapshot({
        ...currentState,
        components: nextComponents,
        manualConnections: nextManualConnections,
      })
    ));

    return { success: true };
  },

  rollbackGhostFix: () => {
    set({ ghostFixPreview: null });
  },
});
