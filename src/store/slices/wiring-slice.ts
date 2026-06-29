import { v4 as uuidv4 } from 'uuid';
import type { StateCreator } from 'zustand';
import { getInitialPins } from '@/constants/board-pins';
import { getTemplateById } from '@/constants/component-templates';
import { autoAssignPins, releasePins } from '@/lib/auto-router';
import { getRequirementForComponentPin, isGroundRequirement, isPowerRequirement, isSharedBoardPin, validateBoardPinAssignment } from '@/lib/pin-compatibility';
import { getPinnedAssignmentsForComponent } from '@/lib/pin-locks';
import { createHistorySnapshot, withHistory } from '@/store/board-history';
import {
  applyManualRoutingCompletion,
  appendItem,
  connectionKey,
  endpointKey,
  isComponentFullyRoutedWithManualConnections,
  normalizeEndpoint,
  releaseBoardPinIfNeeded,
  replaceComponentById,
  upsertBoardPin,
} from '@/store/store-helpers';
import type { BoardStoreState } from '@/store/store-types';
import type { PlacedComponent } from '@/types';

export const createWiringSlice: StateCreator<BoardStoreState, [], [], Partial<BoardStoreState>> = (set, get) => ({
  autoAssignPins: instanceId => {
    const state = get();
    const component = state.components.find(c => c.instanceId === instanceId);
    if (!component) {
      return { success: false, error: '컴포넌트를 찾을 수 없습니다.' };
    }

    const template = getTemplateById(component.templateId);
    if (!template) {
      return { success: false, error: '템플릿을 찾을 수 없습니다.' };
    }

    if (template.category === 'PASSIVE') {
      return { success: false, error: '수동소자는 자동 배선 대신 패드-패드 수동 연결로 배선해 주세요.' };
    }

    const manualAssignments = getPinnedAssignmentsForComponent(component, state.pins, 'manual');
    const autoAssignments = getPinnedAssignmentsForComponent(component, state.pins, 'auto');

    const clearedComponent = {
      ...component,
      assignedPins: manualAssignments,
      isFullyRouted: false,
    };
    const basePins = releasePins(instanceId, autoAssignments, state.pins);
    const result = autoAssignPins(clearedComponent, template, basePins, state.activeBoardId);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const nextComponent = {
      ...clearedComponent,
      assignedPins: result.assigned,
      isFullyRouted: true,
    };
    const nextComponents = replaceComponentById(
      state.components,
      instanceId,
      () => nextComponent
    );

    set(currentState => withHistory(
      currentState,
      {
        pins: result.updatedPins,
        components: nextComponents,
      },
      createHistorySnapshot({
        ...currentState,
        pins: result.updatedPins,
        components: nextComponents,
      })
    ));

    return { success: true };
  },

  autoAssignAllComponents: () => {
    const { activeBoardId, components, pins, manualConnections } = get();
    let nextPins = getInitialPins(activeBoardId);
    const nextComponents: PlacedComponent[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const component of components) {
      const template = getTemplateById(component.templateId);
      if (!template) {
        nextComponents.push({
          ...component,
          assignedPins: {},
          isFullyRouted: false,
        });
        failCount++;
        continue;
      }

      if (template.category === 'PASSIVE') {
        nextComponents.push({
          ...component,
          isFullyRouted: isComponentFullyRoutedWithManualConnections(component, template, manualConnections),
        });
        continue;
      }

      const candidate = {
        ...component,
        assignedPins: getPinnedAssignmentsForComponent(component, pins, 'manual'),
        isFullyRouted: false,
      };
      const result = autoAssignPins(candidate, template, nextPins, activeBoardId);

      if (!result.success) {
        nextComponents.push(candidate);
        failCount++;
        continue;
      }

      nextPins = result.updatedPins;
      nextComponents.push({
        ...candidate,
        assignedPins: result.assigned,
        isFullyRouted: true,
      });
      successCount++;
    }

    set(state => withHistory(
      state,
      {
        pins: nextPins,
        components: nextComponents,
      },
      createHistorySnapshot({
        ...state,
        pins: nextPins,
        components: nextComponents,
      })
    ));

    return { successCount, failCount };
  },

  assignPinToComponent: (instanceId, componentPin, boardPinId) => {
    const state = get();
    const component = state.components.find(c => c.instanceId === instanceId);
    if (!component) {
      return { success: false, error: '컴포넌트를 찾을 수 없습니다.' };
    }

    const template = getTemplateById(component.templateId);
    if (!template) {
      return { success: false, error: '템플릿을 찾을 수 없습니다.' };
    }

    const requirement = getRequirementForComponentPin(template, componentPin);
    if (!requirement) {
      return { success: false, error: '해당 부품 핀 정의를 찾을 수 없습니다.' };
    }

    const boardPin = state.pins[boardPinId];
    if (!boardPin) {
      return { success: false, error: '보드 핀 정의를 찾을 수 없습니다.' };
    }

    const compatibility = validateBoardPinAssignment(template, componentPin, boardPin);
    if (!compatibility.valid) {
      if (isPowerRequirement(requirement)) {
        return { success: false, error: '전원 핀에는 5V 또는 3.3V만 연결할 수 있습니다.' };
      }
      if (isGroundRequirement(requirement)) {
        return { success: false, error: 'GND 핀에는 접지만 연결할 수 있습니다.' };
      }
      return { success: false, error: `${componentPin}에는 ${boardPinId}를 연결할 수 없습니다.` };
    }

    const isSharedPin = isSharedBoardPin(boardPinId);

    if (!isSharedPin && boardPin.isUsed && boardPin.connectedTo !== instanceId) {
      return { success: false, error: `${boardPinId} 핀은 이미 다른 부품이 사용 중입니다.` };
    }

    const existingBoardPinForComponentPin = component.assignedPins[componentPin];
    const duplicatePinOwner = Object.entries(component.assignedPins).find(
      ([assignedComponentPin, assignedBoardPin]) =>
        assignedComponentPin !== componentPin && assignedBoardPin === boardPinId
    );
    if (duplicatePinOwner) {
      return {
        success: false,
        error: `${boardPinId} 핀은 같은 부품 안에서 이미 ${duplicatePinOwner[0]}에 연결되어 있습니다.`,
      };
    }

    let nextPins = releaseBoardPinIfNeeded(instanceId, existingBoardPinForComponentPin, state.pins);

    if (!isSharedPin) {
      nextPins = upsertBoardPin(nextPins, boardPinId, currentPin => {
        if (
          currentPin.isUsed &&
          currentPin.connectedTo === instanceId &&
          currentPin.assignmentMode === 'manual'
        ) {
          return currentPin;
        }

        return {
          ...currentPin,
          isUsed: true,
          connectedTo: instanceId,
          assignmentMode: 'manual',
        };
      });
    }

    const nextComponents = replaceComponentById(state.components, instanceId, currentComponent => {
      const nextAssignedPins = {
        ...currentComponent.assignedPins,
        [componentPin]: boardPinId,
      };
      const nextComponent = {
        ...currentComponent,
        assignedPins: nextAssignedPins,
      };

      return {
        ...nextComponent,
        isFullyRouted: isComponentFullyRoutedWithManualConnections(nextComponent, template, state.manualConnections),
      };
    });

    set(currentState => withHistory(
      currentState,
      {
        pins: nextPins,
        components: nextComponents,
      },
      createHistorySnapshot({
        ...currentState,
        pins: nextPins,
        components: nextComponents,
      })
    ));

    return { success: true };
  },

  connectPads: (sourceNodeId, sourceHandle, targetNodeId, targetHandle) => {
    const state = get();

    if (!sourceHandle || !targetHandle) {
      return { success: false, error: '핀 정보를 확인할 수 없습니다.' };
    }

    const source = normalizeEndpoint(sourceNodeId, sourceHandle);
    const target = normalizeEndpoint(targetNodeId, targetHandle);

    if (endpointKey(source) === endpointKey(target)) {
      return { success: false, error: '같은 패드끼리는 연결할 수 없습니다.' };
    }

    const duplicate = state.manualConnections.some(connection =>
      connectionKey(connection.source, connection.target) === connectionKey(source, target)
    );
    if (duplicate) {
      return { success: false, error: '이미 연결된 패드입니다.' };
    }

    if (source.ownerType === 'board' && target.ownerType === 'component') {
      return get().assignPinToComponent(target.ownerId, target.pinId, source.pinId);
    }

    if (source.ownerType === 'component' && target.ownerType === 'board') {
      return get().assignPinToComponent(source.ownerId, source.pinId, target.pinId);
    }

    if (source.ownerType === 'board' && target.ownerType === 'board') {
      return { success: false, error: '보드 핀끼리 직접 연결할 수 없습니다.' };
    }

    const nextConnection = {
      id: uuidv4(),
      source,
      target,
    };
    const nextManualConnections = appendItem(state.manualConnections, nextConnection);
    const nextComponents = applyManualRoutingCompletion(state.components, nextManualConnections);

    set(currentState => withHistory(
      currentState,
      {
        components: nextComponents,
        manualConnections: nextManualConnections,
      },
      createHistorySnapshot({
        ...currentState,
        components: nextComponents,
        manualConnections: nextManualConnections,
      })
    ));

    return { success: true };
  },

  removeManualConnection: connectionId => {
    const state = get();
    const nextManualConnections = state.manualConnections.filter(connection => connection.id !== connectionId);
    if (nextManualConnections.length === state.manualConnections.length) {
      return;
    }
    const nextComponents = applyManualRoutingCompletion(state.components, nextManualConnections);

    set(currentState => withHistory(
      currentState,
      {
        components: nextComponents,
        manualConnections: nextManualConnections,
      },
      createHistorySnapshot({
        ...currentState,
        components: nextComponents,
        manualConnections: nextManualConnections,
      })
    ));
  },

  removeAssignedPin: (instanceId, componentPin) => {
    const state = get();
    const component = state.components.find(c => c.instanceId === instanceId);
    if (!component) {
      return;
    }

    const template = getTemplateById(component.templateId);
    if (!template) {
      return;
    }

    const boardPinId = component.assignedPins[componentPin];
    const nextPins = releaseBoardPinIfNeeded(instanceId, boardPinId, state.pins);
    const nextComponents = replaceComponentById(state.components, instanceId, currentComponent => {
      const nextAssignedPins = { ...currentComponent.assignedPins };
      delete nextAssignedPins[componentPin];

      const nextComponent = {
        ...currentComponent,
        assignedPins: nextAssignedPins,
      };

      return {
        ...nextComponent,
        isFullyRouted: isComponentFullyRoutedWithManualConnections(nextComponent, template, state.manualConnections),
      };
    });

    set(currentState => withHistory(
      currentState,
      {
        pins: nextPins,
        components: nextComponents,
      },
      createHistorySnapshot({
        ...currentState,
        pins: nextPins,
        components: nextComponents,
      })
    ));
  },

  clearEdges: () => {
    const { activeBoardId, components } = get();
    const nextPins = getInitialPins(activeBoardId);
    const nextComponents = components.map(component => ({
      ...component,
      assignedPins: {},
      isFullyRouted: false,
    }));

    set(state => withHistory(
      state,
      {
        pins: nextPins,
        components: nextComponents,
        manualConnections: [],
      },
      createHistorySnapshot({
        ...state,
        pins: nextPins,
        components: nextComponents,
        manualConnections: [],
      })
    ));
  },
});
