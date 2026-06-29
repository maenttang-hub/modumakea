import { v4 as uuidv4 } from 'uuid';
import type { StateCreator } from 'zustand';
import { getTemplateById } from '@/constants/component-templates';
import { assignSharedRailPins, autoAssignPins, releasePins } from '@/lib/auto-router';
import { buildAiAppliedState } from '@/lib/ai-design-apply';
import { getLocalizedTemplateName } from '@/lib/catalog-i18n';
import { getCompanionSuggestionsForTemplate, getProjectedPowerIssueForComponent } from '@/lib/datasheet-rules';
import {
  buildFootprintMatcherModel,
} from '@/lib/footprint-matcher';
import { buildSubCircuitTemplate, collectSubCircuitPortCandidates, isSubCircuitTemplate } from '@/lib/subcircuits';
import { mergeRuntimeTemplateCache } from '@/lib/template-cache-registry';
import { sanitizePlainText } from '@/lib/security-input';
import { createHistorySnapshot, withHistory } from '@/store/board-history';
import {
  appendItem,
  appendItems,
  buildCompanionInsertionPlan,
  isComponentFullyRoutedWithManualConnections,
  mergeTemplateCacheEntries,
  removeComponentById,
  removeManualConnectionsForOwner,
  replaceComponentById,
  upsertBoardPin,
} from '@/store/store-helpers';
import type { BoardStoreState } from '@/store/store-types';

function removeComponentPowerModeEntry(
  componentPowerModes: BoardStoreState['componentPowerModes'],
  instanceId: string
) {
  if (!(instanceId in componentPowerModes)) {
    return componentPowerModes;
  }

  const nextComponentPowerModes = { ...componentPowerModes };
  delete nextComponentPowerModes[instanceId];
  return nextComponentPowerModes;
}

function removeComponentUnusedPinModeEntry(
  componentUnusedPinModes: BoardStoreState['componentUnusedPinModes'],
  instanceId: string
) {
  if (!(instanceId in componentUnusedPinModes)) {
    return componentUnusedPinModes;
  }

  const nextComponentUnusedPinModes = { ...componentUnusedPinModes };
  delete nextComponentUnusedPinModes[instanceId];
  return nextComponentUnusedPinModes;
}

export const createComponentsSlice: StateCreator<BoardStoreState, [], [], Partial<BoardStoreState>> = (set, get) => ({
  cacheTemplate: template => {
    mergeRuntimeTemplateCache([template]);
    set(state => {
      const nextTemplateCache = mergeTemplateCacheEntries(state.templateCache, [template], item => item.id);
      if (nextTemplateCache === state.templateCache) {
        return state;
      }

      return {
        templateCache: nextTemplateCache,
      };
    });
  },

  cacheTemplates: templates => {
    if (templates.length === 0) {
      return;
    }

    mergeRuntimeTemplateCache(templates);
    set(state => {
      const nextTemplateCache = mergeTemplateCacheEntries(state.templateCache, templates, template => template.id);
      if (nextTemplateCache === state.templateCache) {
        return state;
      }

      return {
        templateCache: nextTemplateCache,
      };
    });
  },

  addComponent: (template, position) => {
    const state = get();
    if (!state.templateCache[template.id]) {
      mergeRuntimeTemplateCache([template]);
    }
    const powerIssue = getProjectedPowerIssueForComponent(
      state.components,
      state.activeBoardId,
      template,
      getTemplateById,
      state.powerInputMode
    );
    if (powerIssue) {
      return { success: false, error: powerIssue.message };
    }

    const instanceId = uuidv4();
    const nextBaseComponent = {
      instanceId,
      templateId: template.id,
      name: `${getLocalizedTemplateName(template, state.appLanguage)} ${state.components.filter(c => c.templateId === template.id).length + 1}`,
      value: template.defaultValue,
      position,
      rotation: 0 as const,
      assignedPins: {},
      isFullyRouted: false,
    };
    const autoCompanionItems = getCompanionSuggestionsForTemplate(template, state.activeBoardId).filter(
      item => item.level === 'required'
    );

    if (template.category === 'PASSIVE') {
      const nextComponents = appendItem(state.components, nextBaseComponent);

      set(currentState => withHistory(
        currentState,
        {
          components: nextComponents,
          templateCache: mergeTemplateCacheEntries(currentState.templateCache, [template], item => item.id),
          selectedComponentId: instanceId,
        },
        createHistorySnapshot({
          ...currentState,
          components: nextComponents,
          selectedComponentId: instanceId,
        })
      ));

      return { success: true };
    }

    if (state.wiringMode === 'auto') {
      const routed = autoAssignPins(nextBaseComponent, template, state.pins, state.activeBoardId);
      if (!routed.success) {
        return { success: false, error: routed.error };
      }

      const nextComponent = {
        ...nextBaseComponent,
        assignedPins: routed.assigned,
        isFullyRouted: true,
      };
      const autoCompanions = buildCompanionInsertionPlan(
        nextComponent,
        autoCompanionItems,
        appendItem(state.components, nextComponent),
        state.appLanguage
      );
      const nextComponents = appendItems(
        appendItem(state.components, nextComponent),
        autoCompanions
      );

      set(currentState => withHistory(
        currentState,
        {
          pins: routed.updatedPins,
          components: nextComponents,
          manualConnections: currentState.manualConnections,
          templateCache: mergeTemplateCacheEntries(currentState.templateCache, [template], item => item.id),
          selectedComponentId: instanceId,
        },
        createHistorySnapshot({
          ...currentState,
          pins: routed.updatedPins,
          components: nextComponents,
          selectedComponentId: instanceId,
        })
      ));

      return { success: true };
    }

    const railResult = assignSharedRailPins(template, state.pins, state.activeBoardId);
    if (!railResult.success) {
      return { success: false, error: railResult.error };
    }

    const nextComponent = {
      ...nextBaseComponent,
      assignedPins: railResult.assigned,
    };
    nextComponent.isFullyRouted = isComponentFullyRoutedWithManualConnections(
      nextComponent,
      template,
      state.manualConnections
    );
    const autoCompanions = buildCompanionInsertionPlan(
      nextComponent,
      autoCompanionItems,
      appendItem(state.components, nextComponent),
      state.appLanguage
    );
    const nextComponents = appendItems(
      appendItem(state.components, nextComponent),
      autoCompanions
    );

    set(currentState => withHistory(
      currentState,
      {
        components: nextComponents,
        manualConnections: currentState.manualConnections,
        templateCache: mergeTemplateCacheEntries(currentState.templateCache, [template], item => item.id),
        selectedComponentId: instanceId,
      },
      createHistorySnapshot({
        ...currentState,
        components: nextComponents,
        selectedComponentId: instanceId,
      })
    ));

    return { success: true };
  },

  insertCompanionParts: (componentInstanceId, items) => {
    const state = get();
    const targetComponent = state.components.find(component => component.instanceId === componentInstanceId);
    if (!targetComponent) {
      return { success: false, addedCount: 0, error: '대상 부품을 찾을 수 없습니다.' };
    }

    const nextCompanions = buildCompanionInsertionPlan(targetComponent, items, state.components, state.appLanguage);
    if (nextCompanions.length === 0) {
      return { success: false, addedCount: 0, error: '동반 부품 템플릿을 찾지 못했습니다.' };
    }

    const nextComponents = appendItems(state.components, nextCompanions);

    set(currentState =>
      withHistory(
        currentState,
        {
          components: nextComponents,
          selectedComponentId: componentInstanceId,
        },
        createHistorySnapshot({
          ...currentState,
          components: nextComponents,
          selectedComponentId: componentInstanceId,
        })
      )
    );

    return { success: true, addedCount: nextCompanions.length };
  },

  removeComponent: instanceId => {
    const state = get();
    const component = state.components.find(c => c.instanceId === instanceId);
    if (!component) {
      return;
    }

    const nextPins = releasePins(instanceId, component.assignedPins, state.pins);
    const nextComponents = removeComponentById(state.components, instanceId);
    const nextManualConnections = removeManualConnectionsForOwner(state.manualConnections, instanceId);

    set(currentState => withHistory(
      currentState,
      {
        pins: nextPins,
        components: nextComponents,
        manualConnections: nextManualConnections,
        componentPowerModes: removeComponentPowerModeEntry(currentState.componentPowerModes, instanceId),
        componentUnusedPinModes: removeComponentUnusedPinModeEntry(currentState.componentUnusedPinModes, instanceId),
        selectedComponentId:
          currentState.selectedComponentId === instanceId ? null : currentState.selectedComponentId,
      },
      createHistorySnapshot({
        ...currentState,
        pins: nextPins,
        components: nextComponents,
        manualConnections: nextManualConnections,
        componentPowerModes: removeComponentPowerModeEntry(currentState.componentPowerModes, instanceId),
        componentUnusedPinModes: removeComponentUnusedPinModeEntry(currentState.componentUnusedPinModes, instanceId),
        selectedComponentId:
          currentState.selectedComponentId === instanceId ? null : currentState.selectedComponentId,
      })
    ));
  },

  duplicateComponent: instanceId => {
    const state = get();
    const source = state.components.find(component => component.instanceId === instanceId);
    if (!source) {
      return { success: false, error: '복제할 부품을 찾을 수 없습니다.' };
    }

    const template = getTemplateById(source.templateId);
    if (!template) {
      return { success: false, error: '부품 템플릿을 찾을 수 없습니다.' };
    }

    const duplicatedId = uuidv4();
    const nextPosition = {
      x: source.position.x + 60,
      y: source.position.y + 45,
    };
    const nextComponent = {
      ...source,
      instanceId: duplicatedId,
      name: `${source.name} 복사`,
      position: nextPosition,
      assignedPins: {},
      isFullyRouted: false,
    };
    const nextComponents = appendItem(state.components, nextComponent);

    set(currentState => withHistory(
      currentState,
      {
        components: nextComponents,
        componentPowerModes: source.instanceId in currentState.componentPowerModes
          ? {
              ...currentState.componentPowerModes,
              [duplicatedId]: currentState.componentPowerModes[source.instanceId]!,
            }
          : currentState.componentPowerModes,
        componentUnusedPinModes: source.instanceId in currentState.componentUnusedPinModes
          ? {
              ...currentState.componentUnusedPinModes,
              [duplicatedId]: {
                ...currentState.componentUnusedPinModes[source.instanceId],
              },
            }
          : currentState.componentUnusedPinModes,
        selectedComponentId: duplicatedId,
      },
      createHistorySnapshot({
        ...currentState,
        components: nextComponents,
        componentPowerModes: source.instanceId in currentState.componentPowerModes
          ? {
              ...currentState.componentPowerModes,
              [duplicatedId]: currentState.componentPowerModes[source.instanceId]!,
            }
          : currentState.componentPowerModes,
        componentUnusedPinModes: source.instanceId in currentState.componentUnusedPinModes
          ? {
              ...currentState.componentUnusedPinModes,
              [duplicatedId]: {
                ...currentState.componentUnusedPinModes[source.instanceId],
              },
            }
          : currentState.componentUnusedPinModes,
        selectedComponentId: duplicatedId,
      })
    ));

    return { success: true, duplicatedId };
  },

  createSubCircuitComponent: (instanceIds, options) => {
    const state = get();
    const uniqueInstanceIds = Array.from(new Set(instanceIds)).filter(id => id !== 'board-node');
    if (uniqueInstanceIds.length < 2) {
      return { success: false, error: '서브서킷으로 묶으려면 부품을 2개 이상 선택해야 합니다.' };
    }

    const selectedComponents = state.components.filter(component => uniqueInstanceIds.includes(component.instanceId));
    if (selectedComponents.length !== uniqueInstanceIds.length) {
      return { success: false, error: '선택된 부품 중 일부를 찾을 수 없습니다.' };
    }

    const availablePorts = collectSubCircuitPortCandidates(
      state.components,
      uniqueInstanceIds,
      state.manualConnections,
      state.activeBoardId,
      getTemplateById
    );
    if (availablePorts.length === 0) {
      return { success: false, error: '외부 포트 후보를 찾지 못했습니다. 선택된 내부 회로에 꺼낼 핀이나 넷이 있는지 확인해 주세요.' };
    }

    const normalizedPorts = options.ports
      .map(port => ({
        externalPinId: sanitizePlainText(port.externalPinId, { maxLength: 48 }).toUpperCase(),
        internalEndpoint: port.internalEndpoint,
        allowedTypes: port.allowedTypes,
      }))
      .filter(port => port.externalPinId.length > 0);

    if (normalizedPorts.length === 0) {
      return { success: false, error: '외부로 노출할 핀 이름을 하나 이상 지정해야 합니다.' };
    }

    const candidateKeySet = new Set(
      availablePorts.flatMap(port =>
        port.groupedInternalEndpoints.map(endpoint => `${endpoint.ownerId}:${endpoint.pinId}`)
      )
    );
    for (const port of normalizedPorts) {
      const key = `${port.internalEndpoint.ownerId}:${port.internalEndpoint.pinId}`;
      if (!candidateKeySet.has(key)) {
        return { success: false, error: '서브서킷 포트 구성이 현재 선택과 맞지 않습니다.' };
      }
    }

    const duplicateExternalPins = normalizedPorts
      .map(port => port.externalPinId)
      .filter((pinName, index, list) => list.indexOf(pinName) !== index);
    if (duplicateExternalPins.length > 0) {
      return { success: false, error: `외부 포트 이름이 중복되었습니다: ${Array.from(new Set(duplicateExternalPins)).join(', ')}` };
    }

    const selectedSet = new Set(uniqueInstanceIds);
    const internalConnections = state.manualConnections.filter(connection =>
      connection.source.ownerType === 'component' &&
      connection.target.ownerType === 'component' &&
      selectedSet.has(connection.source.ownerId) &&
      selectedSet.has(connection.target.ownerId)
    );
    const externalConnections = state.manualConnections.filter(connection => {
      const sourceSelected = connection.source.ownerType === 'component' && selectedSet.has(connection.source.ownerId);
      const targetSelected = connection.target.ownerType === 'component' && selectedSet.has(connection.target.ownerId);
      return sourceSelected !== targetSelected;
    });

    const nameSeed = sanitizePlainText(options.templateName, { maxLength: 80, fallback: '서브서킷' }) || '서브서킷';
    const templateId = `subckt_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const instanceId = uuidv4();
    const template = buildSubCircuitTemplate({
      templateId,
      templateName: nameSeed,
      components: selectedComponents,
      manualConnections: internalConnections,
      ports: normalizedPorts,
    });

    mergeRuntimeTemplateCache([template]);

    const boundingBox = selectedComponents.reduce(
      (acc, component) => ({
        minX: Math.min(acc.minX, component.position.x),
        minY: Math.min(acc.minY, component.position.y),
        maxX: Math.max(acc.maxX, component.position.x + 180),
        maxY: Math.max(acc.maxY, component.position.y + 120),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      }
    );

    const assignedPins = normalizedPorts.reduce<Record<string, string>>((acc, port) => {
      const sourceComponent = selectedComponents.find(component => component.instanceId === port.internalEndpoint.ownerId);
      const assignedBoardPin = sourceComponent?.assignedPins[port.internalEndpoint.pinId];
      if (assignedBoardPin) {
        acc[port.externalPinId] = assignedBoardPin;
      }
      return acc;
    }, {});

    const newExternalConnections = externalConnections.map(connection => {
      const selectedEndpoint =
        connection.source.ownerType === 'component' && selectedSet.has(connection.source.ownerId)
          ? connection.source
          : connection.target;
      const externalEndpoint = selectedEndpoint === connection.source ? connection.target : connection.source;
      const matchedPort = normalizedPorts.find(
        port =>
          port.internalEndpoint.ownerId === selectedEndpoint.ownerId &&
          port.internalEndpoint.pinId === selectedEndpoint.pinId
      );
      if (!matchedPort) {
        return null;
      }

      return {
        id: uuidv4(),
        source:
          selectedEndpoint === connection.source
            ? { ownerType: 'component' as const, ownerId: instanceId, pinId: matchedPort.externalPinId }
            : externalEndpoint,
        target:
          selectedEndpoint === connection.source
            ? externalEndpoint
            : { ownerType: 'component' as const, ownerId: instanceId, pinId: matchedPort.externalPinId },
        suggestedNetName: connection.suggestedNetName,
      };
    }).filter((connection): connection is NonNullable<typeof connection> => Boolean(connection));

    let nextPins = state.pins;
    for (const component of selectedComponents) {
      nextPins = releasePins(component.instanceId, component.assignedPins, nextPins);
    }
    for (const boardPinId of Object.values(assignedPins)) {
      nextPins = upsertBoardPin(nextPins, boardPinId, pin => ({
        ...pin,
        isUsed: true,
        connectedTo: instanceId,
        assignmentMode: 'manual',
      }));
    }

    const survivingComponents = state.components.filter(component => !selectedSet.has(component.instanceId));
    const nextComponent = {
      instanceId,
      templateId,
      name: `${nameSeed} 1`,
      value: undefined,
      position: {
        x: Math.round(((boundingBox.minX + boundingBox.maxX) / 2 - 90) / 15) * 15,
        y: Math.round(((boundingBox.minY + boundingBox.maxY) / 2 - 60) / 15) * 15,
      },
      rotation: 0 as const,
      assignedPins,
      isFullyRouted: true,
      isSubCircuitInstance: true,
    };
    const nextComponents = appendItem(survivingComponents, nextComponent);
    const untouchedConnections = state.manualConnections.filter(connection => {
      const sourceSelected = connection.source.ownerType === 'component' && selectedSet.has(connection.source.ownerId);
      const targetSelected = connection.target.ownerType === 'component' && selectedSet.has(connection.target.ownerId);
      return !sourceSelected && !targetSelected;
    });
    const nextManualConnections = [...untouchedConnections, ...newExternalConnections];
    const nextTemplateCache = mergeTemplateCacheEntries(state.templateCache, [template], item => item.id);

    set(currentState => withHistory(
      currentState,
      {
        pins: nextPins,
        components: nextComponents,
        manualConnections: nextManualConnections,
        templateCache: nextTemplateCache,
        selectedComponentId: instanceId,
      },
      createHistorySnapshot({
        ...currentState,
        pins: nextPins,
        components: nextComponents,
        manualConnections: nextManualConnections,
        selectedComponentId: instanceId,
      })
    ));

    return { success: true, instanceId, templateId };
  },

  updateSubCircuitTemplate: (templateId, update) => {
    const state = get();
    const currentTemplate = state.templateCache[templateId] ?? getTemplateById(templateId);
    if (!isSubCircuitTemplate(currentTemplate)) {
      return { success: false, error: '편집할 서브서킷 템플릿을 찾지 못했습니다.' };
    }

    const nextName = update.templateName
      ? sanitizePlainText(update.templateName, { maxLength: 80, fallback: currentTemplate.name }) || currentTemplate.name
      : currentTemplate.name;
    const components = update.internalState.components.map(component => ({
      ...component,
      assignedPins: {},
      isFullyRouted: true,
      position: {
        x: Math.round(component.position.x / 15) * 15,
        y: Math.round(component.position.y / 15) * 15,
      },
    }));
    const componentIds = new Set(components.map(component => component.instanceId));
    const manualConnections = update.internalState.manualConnections
      .filter(connection =>
        connection.source.ownerType === 'component' &&
        connection.target.ownerType === 'component' &&
        componentIds.has(connection.source.ownerId) &&
        componentIds.has(connection.target.ownerId)
      )
      .map(connection => ({
        ...connection,
        source: { ...connection.source, ownerType: 'component' as const },
        target: { ...connection.target, ownerType: 'component' as const },
      }));

    const candidatePorts = collectSubCircuitPortCandidates(
      components,
      Array.from(componentIds),
      manualConnections,
      state.activeBoardId,
      getTemplateById
    );
    const allowedTypesByEndpoint = new Map<string, (typeof candidatePorts)[number]['allowedTypes']>();
    for (const candidate of candidatePorts) {
      for (const endpoint of candidate.groupedInternalEndpoints) {
        allowedTypesByEndpoint.set(`${endpoint.ownerId}:${endpoint.pinId}`, candidate.allowedTypes);
      }
    }

    const rawPortMappings = update.portMappings
      .map(port => ({
        externalPinId: sanitizePlainText(port.externalPinId, { maxLength: 48, fallback: port.externalPinId }).toUpperCase(),
        internalEndpoint: {
          ownerType: 'component' as const,
          ownerId: port.internalEndpoint.ownerId,
          pinId: port.internalEndpoint.pinId,
        },
      }))
      .filter(port => componentIds.has(port.internalEndpoint.ownerId) && port.externalPinId.length > 0);

    const invalidPortMappings = rawPortMappings.filter(
      port => !allowedTypesByEndpoint.has(`${port.internalEndpoint.ownerId}:${port.internalEndpoint.pinId}`)
    );
    if (invalidPortMappings.length > 0) {
      return { success: false, error: '추가한 포트 중 일부가 현재 내부 넷 구조와 맞지 않습니다.' };
    }

    const portMappings = rawPortMappings.filter(port =>
      allowedTypesByEndpoint.has(`${port.internalEndpoint.ownerId}:${port.internalEndpoint.pinId}`)
    );
    if (portMappings.length === 0) {
      return { success: false, error: '서브서킷에는 최소 한 개 이상의 외부 포트가 필요합니다.' };
    }

    const duplicateExternalPins = portMappings
      .map(port => port.externalPinId)
      .filter((pinName, index, list) => list.indexOf(pinName) !== index);
    if (duplicateExternalPins.length > 0) {
      return { success: false, error: `외부 포트 이름이 중복되었습니다: ${Array.from(new Set(duplicateExternalPins)).join(', ')}` };
    }

    const oldPortByEndpoint = new Map(
      currentTemplate.portMappings.map(port => [`${port.internalEndpoint.ownerId}:${port.internalEndpoint.pinId}`, port.externalPinId])
    );
    const oldEndpointByPortName = new Map(
      currentTemplate.portMappings.map(port => [port.externalPinId, `${port.internalEndpoint.ownerId}:${port.internalEndpoint.pinId}`])
    );
    const newPortByEndpoint = new Map(
      portMappings.map(port => [`${port.internalEndpoint.ownerId}:${port.internalEndpoint.pinId}`, port.externalPinId])
    );
    const nextPortNames = new Set(portMappings.map(port => port.externalPinId));

    const nextTemplate = {
      ...currentTemplate,
      name: nextName,
      description: `${nextName} 서브서킷`,
      requiredPins: portMappings.map(port => ({
        name: port.externalPinId,
        allowedTypes: allowedTypesByEndpoint.get(`${port.internalEndpoint.ownerId}:${port.internalEndpoint.pinId}`) ?? ['DIGITAL'],
      })),
      internalState: {
        components,
        manualConnections,
      },
      portMappings: portMappings.map(port => ({
        externalPinId: port.externalPinId,
        internalEndpoint: { ...port.internalEndpoint },
        internalComponentName: components.find(component => component.instanceId === port.internalEndpoint.ownerId)?.name,
        internalPinLabel: port.internalEndpoint.pinId,
      })),
    };

    mergeRuntimeTemplateCache([nextTemplate]);

    const affectedInstanceIds = new Set(
      state.components
        .filter(component => component.templateId === templateId)
        .map(component => component.instanceId)
    );
    const nextComponents = state.components.map(component => {
      if (component.templateId !== templateId) {
        return component;
      }

      const nextAssignedPins = portMappings.reduce<Record<string, string>>((acc, port) => {
        const endpointId = `${port.internalEndpoint.ownerId}:${port.internalEndpoint.pinId}`;
        const previousPinName = oldPortByEndpoint.get(endpointId);
        const carriedPin =
          (previousPinName ? component.assignedPins[previousPinName] : undefined) ??
          component.assignedPins[port.externalPinId];
        if (carriedPin) {
          acc[port.externalPinId] = carriedPin;
        }
        return acc;
      }, {});

      return {
        ...component,
        assignedPins: nextAssignedPins,
      };
    });

    const nextManualConnections = state.manualConnections.flatMap(connection => {
      const remapEndpoint = (endpoint: typeof connection.source) => {
        if (endpoint.ownerType !== 'component' || !affectedInstanceIds.has(endpoint.ownerId)) {
          return endpoint;
        }

        const endpointId = oldEndpointByPortName.get(endpoint.pinId);
        const nextPinId = endpointId
          ? newPortByEndpoint.get(endpointId)
          : nextPortNames.has(endpoint.pinId)
            ? endpoint.pinId
            : null;
        if (!nextPinId) {
          return null;
        }

        return {
          ...endpoint,
          pinId: nextPinId,
        };
      };

      const nextSource = remapEndpoint(connection.source);
      const nextTarget = remapEndpoint(connection.target);
      if (!nextSource || !nextTarget) {
        return [];
      }

      return [{
        ...connection,
        source: nextSource,
        target: nextTarget,
      }];
    });

    let nextPins = state.pins;
    for (const component of state.components) {
      if (component.templateId !== templateId) {
        continue;
      }
      nextPins = releasePins(component.instanceId, component.assignedPins, nextPins);
    }
    for (const component of nextComponents) {
      if (component.templateId !== templateId) {
        continue;
      }
      for (const boardPinId of Object.values(component.assignedPins)) {
        nextPins = upsertBoardPin(nextPins, boardPinId, pin => ({
          ...pin,
          isUsed: true,
          connectedTo: component.instanceId,
          assignmentMode: 'manual',
        }));
      }
    }

    set(currentState => withHistory(
      currentState,
      {
        templateCache: mergeTemplateCacheEntries(currentState.templateCache, [nextTemplate], item => item.id),
        components: nextComponents,
        manualConnections: nextManualConnections,
        pins: nextPins,
      },
      createHistorySnapshot({
        ...currentState,
        components: nextComponents,
        manualConnections: nextManualConnections,
        pins: nextPins,
      })
    ));

    return { success: true };
  },

  updateComponentPosition: (instanceId, position) => {
    set(state => {
      const currentComponent = state.components.find(component => component.instanceId === instanceId);
      if (!currentComponent) {
        return state;
      }

      if (
        currentComponent.position.x === position.x &&
        currentComponent.position.y === position.y
      ) {
        return state;
      }

      const nextComponents = replaceComponentById(state.components, instanceId, component => ({
        ...component,
        position,
      }));

      return withHistory(
        state,
        { components: nextComponents },
        createHistorySnapshot({ ...state, components: nextComponents })
      );
    });
  },

  rotateComponent: instanceId => {
    set(state => {
      const nextComponents = replaceComponentById(state.components, instanceId, component => ({
        ...component,
        rotation: ((component.rotation + 90) % 360) as 0 | 90 | 180 | 270,
      }));

      return withHistory(
        state,
        { components: nextComponents },
        createHistorySnapshot({ ...state, components: nextComponents })
      );
    });
  },

  updateComponentName: (instanceId, name) => {
    set(state => {
      const sanitizedName = sanitizePlainText(name, { maxLength: 80 });
      const nextComponents = replaceComponentById(state.components, instanceId, component => {
        const nextName = sanitizedName || component.name;
        if (nextName === component.name) {
          return component;
        }

        return {
          ...component,
          name: nextName,
        };
      });

      return withHistory(
        state,
        { components: nextComponents },
        createHistorySnapshot({ ...state, components: nextComponents })
      );
    });
  },

  updateComponentValue: (instanceId, value) => {
    set(state => {
      const sanitizedValue = sanitizePlainText(value, { maxLength: 64 });
      const nextComponents = replaceComponentById(state.components, instanceId, component => {
        const nextValue = sanitizedValue.trim().length > 0 ? sanitizedValue : undefined;
        if (nextValue === component.value) {
          return component;
        }

        return {
          ...component,
          value: nextValue,
        };
      });

      return withHistory(
        state,
        { components: nextComponents },
        createHistorySnapshot({ ...state, components: nextComponents })
      );
    });
  },

  setFootprintPinPadOverride: (instanceId, pinId, padId) => {
    set(state => {
      const targetComponent = state.components.find(component => component.instanceId === instanceId);
      const targetTemplate =
        targetComponent
          ? state.templateCache[targetComponent.templateId] ?? getTemplateById(targetComponent.templateId)
          : undefined;

      const nextComponents = replaceComponentById(state.components, instanceId, component => {
        const currentOverrides = component.footprintPinPadOverrides ?? {};
        const nextOverrides = { ...currentOverrides };

        if (!padId) {
          delete nextOverrides[pinId];
        } else {
          nextOverrides[pinId] = padId;
        }

        const hasOverrides = Object.keys(nextOverrides).length > 0;
        const previousValue = currentOverrides[pinId];
        if ((padId ?? undefined) === previousValue && hasOverrides === (component.footprintPinPadOverrides != null)) {
          return component;
        }

        return {
          ...component,
          footprintPinPadOverrides: hasOverrides ? nextOverrides : undefined,
        };
      });

      const nextCache = { ...state.footprintPinPadOverrideCache };
      const updatedComponent = nextComponents.find(component => component.instanceId === instanceId);
      if (updatedComponent) {
        const matcherModel = buildFootprintMatcherModel(
          updatedComponent,
          targetTemplate,
          state.footprintPinPadOverrideCache
        );
        if (matcherModel?.cacheKey) {
          const overrideMap = updatedComponent.footprintPinPadOverrides;
          if (overrideMap && Object.keys(overrideMap).length > 0) {
            nextCache[matcherModel.cacheKey] = {
              key: matcherModel.cacheKey,
              title: matcherModel.title,
              footprint: matcherModel.footprint,
              packageLabel: matcherModel.packageLabel,
              pinPadMap: { ...overrideMap },
              templateId: updatedComponent.templateId,
              libraryId: updatedComponent.importedMapping?.libraryId,
              componentName: updatedComponent.name,
              updatedAt: new Date().toISOString(),
            };
          }
        }
      }

      return withHistory(
        state,
        {
          components: nextComponents,
          footprintPinPadOverrideCache: nextCache,
        },
        createHistorySnapshot({ ...state, components: nextComponents })
      );
    });
  },

  applyAiDesignResult: result => {
    const state = get();
    const composed = buildAiAppliedState(state, result);
    if (!composed.nextState || !composed.nextSnapshot) {
      return {
        success: false,
        error: composed.error ?? 'AI 설계 결과를 적용할 수 없습니다.',
        notice: composed.notice,
        status: composed.status ?? 'failed',
      };
    }

    set(currentState => withHistory(
      currentState,
      composed.nextState!,
      composed.nextSnapshot!
    ));

    return { success: true, notice: composed.notice, status: composed.status ?? 'applied' };
  },

  clearRuntimeComponentStates: () => set(state => {
    if (Object.keys(state.componentRuntimeStates).length === 0) {
      return state;
    }

    return { componentRuntimeStates: {} };
  }),
  setRuntimeComponentStates: componentRuntimeStates => set(state => {
    if (state.componentRuntimeStates === componentRuntimeStates) {
      return state;
    }

    return { componentRuntimeStates };
  }),
  setGeneratedCode: generatedCode => set(state => {
    if (state.generatedCode === generatedCode && state.codeError === null) {
      return state;
    }

    return { generatedCode, codeError: null };
  }),
  setIsGenerating: isGenerating => set(state => {
    if (state.isGenerating === isGenerating) {
      return state;
    }

    return { isGenerating };
  }),
  setCodeError: codeError => set(state => {
    if (state.codeError === codeError) {
      return state;
    }

    return { codeError };
  }),
  setCodeGenerationMeta: lastCodeGenerationMeta => set(state => {
    if (state.lastCodeGenerationMeta === lastCodeGenerationMeta) {
      return state;
    }

    return { lastCodeGenerationMeta };
  }),
  setCompilerManifest: lastCompilerManifest => set(state => {
    if (state.lastCompilerManifest === lastCompilerManifest) {
      return state;
    }

    return { lastCompilerManifest };
  }),
});
