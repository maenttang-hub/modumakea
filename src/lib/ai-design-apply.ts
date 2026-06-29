import { v4 as uuidv4 } from 'uuid';
import { getInitialPins } from '@/constants/board-pins';
import { getTemplateById } from '@/constants/component-templates';
import { runProjectDrc } from '@/lib/drc-engine';
import { getCompanionSuggestionsForTemplate } from '@/lib/datasheet-rules';
import { normalizeAiConceptCompanionTopology } from '@/lib/ai-design-normalize';
import { buildCompanionAutocorrectSummary } from '@/lib/companion-part-display';
import { isSharedBoardPin, validateBoardPinAssignment } from '@/lib/pin-compatibility';
import { validateAiConceptDesignResult } from '@/lib/ai-design-schema';
import {
  buildCompanionInsertionPlan,
  isComponentFullyRoutedWithManualConnections,
  resolvePlacedComponentValue,
} from '@/store/store-helpers';
import { COMPANION_TEMPLATE_IDS } from '@/store/store-config';
import { createHistorySnapshot } from '@/store/board-history';
import type {
  AIConceptDesignResult,
  BoardPin,
  CompanionPartSuggestion,
  ManualNetConnection,
  ComponentTemplate,
  FootprintPinPadOverrideCacheEntry,
  PlacedComponent,
  ProjectAppliedPartialState,
  ProjectHistorySnapshot,
  ProjectPowerInputMode,
  WiringMode,
} from '@/types';

export interface AiDesignApplicationState {
  powerInputMode: ProjectPowerInputMode;
  wiringMode: WiringMode;
  showGrid: boolean;
  showMinimap: boolean;
  footprintPinPadOverrideCache?: Record<string, FootprintPinPadOverrideCacheEntry>;
}

export interface AiDesignAppliedResult {
  nextState?: ProjectAppliedPartialState;
  nextSnapshot?: ProjectHistorySnapshot;
  error?: string;
  notice?: string;
  status?: 'applied' | 'applied-with-autocorrect' | 'manual-review-required' | 'failed';
}

function isComponentFullyRouted(component: PlacedComponent, template: ComponentTemplate) {
  return template.requiredPins.every(pin => Boolean(component.assignedPins[pin.name]));
}

function summarizeBlockingIssues(
  blockingIssues: Array<{ title: string; message: string; ruleId?: string }>
) {
  const primary = blockingIssues
    .slice(0, 3)
    .map(issue => `${issue.title}: ${issue.message}`)
    .join(' / ');

  const hints: string[] = [];
  if (blockingIssues.some(issue => issue.ruleId?.includes('led-current-limit') || issue.ruleId?.includes('rgb-current-limit'))) {
    hints.push('LED 계열은 채널당 220Ω~330Ω 직렬 저항이 필요합니다.');
  }
  if (blockingIssues.some(issue => issue.ruleId?.startsWith('companion.shortage.'))) {
    hints.push('리뷰 패널의 동반 부품 섹션에서 필요한 보조 부품을 바로 배치할 수 있습니다.');
  }
  if (blockingIssues.some(issue => issue.ruleId === 'electrical.i2c-pullup-missing')) {
    hints.push('I2C 버스에는 보통 4.7kΩ~10kΩ 외부 풀업 저항을 확인해야 합니다.');
  }

  return [primary, ...hints].filter(Boolean).join(' ');
}

function collectRequiredCompanionItems(template: ComponentTemplate, boardId: string) {
  return getCompanionSuggestionsForTemplate(template, boardId).filter(item => item.level === 'required');
}

function autoInsertRequiredCompanions(
  components: PlacedComponent[],
  boardId: string,
  pins: Record<string, BoardPin>
): {
  components: PlacedComponent[];
  pins: Record<string, BoardPin>;
  manualConnections: ManualNetConnection[];
  addedCount: number;
  addedSummary: Array<{ componentName: string; items: CompanionPartSuggestion[] }>;
} {
  let nextComponents = [...components];
  let nextPins = { ...pins };
  const manualConnections: ManualNetConnection[] = [];
  const addedSummary: Array<{ componentName: string; items: CompanionPartSuggestion[] }> = [];
  let addedCount = 0;
  const fulfilledByKind = new Map<CompanionPartSuggestion['kind'], number>();
  const requiredDemandByKind = new Map<CompanionPartSuggestion['kind'], number>();
  const resistorTemplate = getTemplateById('tpl_resistor');
  let autoResistorOffset = 0;

  for (const component of components) {
    for (const [kind, templateId] of Object.entries(COMPANION_TEMPLATE_IDS) as Array<
      [CompanionPartSuggestion['kind'], string]
    >) {
      if (component.templateId === templateId) {
        fulfilledByKind.set(kind, (fulfilledByKind.get(kind) ?? 0) + 1);
      }
    }
  }

  const claimSeriesResistor = (targetComponent: PlacedComponent, boardPinId: string) => {
    const anchored = nextComponents.find(component => {
      if (component.templateId !== 'tpl_resistor') {
        return false;
      }

      const hasManualNet = manualConnections.some(connection =>
        (connection.source.ownerType === 'component' && connection.source.ownerId === component.instanceId) ||
        (connection.target.ownerType === 'component' && connection.target.ownerId === component.instanceId)
      );
      if (hasManualNet) {
        return false;
      }

      const entries = Object.entries(component.assignedPins);
      return entries.length === 1 && entries[0]?.[1] === boardPinId;
    });

    if (anchored) {
      return anchored;
    }

    const available = nextComponents.find(component => {
      if (component.templateId !== 'tpl_resistor') {
        return false;
      }

      const hasAssignedPins = Object.keys(component.assignedPins).length > 0;
      const hasManualNet = manualConnections.some(connection =>
        (connection.source.ownerType === 'component' && connection.source.ownerId === component.instanceId) ||
        (connection.target.ownerType === 'component' && connection.target.ownerId === component.instanceId)
      );

      return !hasAssignedPins && !hasManualNet;
    });

    if (available) {
      return available;
    }

    if (!resistorTemplate) {
      return null;
    }

    autoResistorOffset += 1;
    const created: PlacedComponent = {
      instanceId: uuidv4(),
      templateId: resistorTemplate.id,
      name: `${resistorTemplate.name} ${nextComponents.filter(component => component.templateId === resistorTemplate.id).length + 1}`,
      value: resolvePlacedComponentValue(resistorTemplate, '220-330 Ohm'),
      position: {
        x: targetComponent.position.x + 180 + (autoResistorOffset % 2) * 120,
        y: targetComponent.position.y + Math.floor(autoResistorOffset / 2) * 75,
      },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
    };
    nextComponents = [...nextComponents, created];
    fulfilledByKind.set('resistor', (fulfilledByKind.get('resistor') ?? 0) + 1);
    addedCount += 1;
    return created;
  };

  const rerouteLedThroughResistor = (component: PlacedComponent, signalPinName: string) => {
    const boardPinId = component.assignedPins[signalPinName];
    if (!boardPinId) {
      return false;
    }

    const resistor = claimSeriesResistor(component, boardPinId);
    if (!resistor) {
      return false;
    }

    const existingResistorPin = Object.entries(resistor.assignedPins).find(([, assignedBoardPin]) => assignedBoardPin === boardPinId)?.[0];
    const boardSidePin = existingResistorPin ?? '1';
    const seriesSidePin = boardSidePin === '1' ? '2' : '1';

    if (!existingResistorPin) {
      resistor.assignedPins = {
        ...resistor.assignedPins,
        [boardSidePin]: boardPinId,
      };
    }

    manualConnections.push({
      id: uuidv4(),
      source: {
        ownerType: 'component',
        ownerId: resistor.instanceId,
        pinId: seriesSidePin,
      },
      target: {
        ownerType: 'component',
        ownerId: component.instanceId,
        pinId: signalPinName,
      },
      suggestedNetName: `${component.instanceId}_${signalPinName.toLowerCase()}`,
    });

    const nextAssignedPins = { ...component.assignedPins };
    delete nextAssignedPins[signalPinName];
    component.assignedPins = nextAssignedPins;

    if (!isSharedBoardPin(boardPinId) && nextPins[boardPinId]) {
      nextPins = {
        ...nextPins,
        [boardPinId]: {
          ...nextPins[boardPinId],
          isUsed: true,
          connectedTo: resistor.instanceId,
          assignmentMode: 'auto',
        },
      };
    }

    return true;
  };

  const topologicalCompanions = new Set<string>();
  for (const component of nextComponents) {
    if (component.templateId === 'tpl_led') {
      if (rerouteLedThroughResistor(component, 'Signal')) {
        topologicalCompanions.add(component.instanceId);
      }
      continue;
    }

    if (component.templateId === 'tpl_rgb_led') {
      let changed = false;
      for (const channel of ['R', 'G', 'B']) {
        changed = rerouteLedThroughResistor(component, channel) || changed;
      }
      if (changed) {
        topologicalCompanions.add(component.instanceId);
      }
    }
  }

  for (const component of components) {
    const template = getTemplateById(component.templateId);
    if (!template) {
      continue;
    }
    if (topologicalCompanions.has(component.instanceId)) {
      addedSummary.push({
        componentName: component.name,
        items: collectRequiredCompanionItems(template, boardId),
      });
      continue;
    }

    const rawRequiredItems = collectRequiredCompanionItems(template, boardId);
    if (rawRequiredItems.length === 0) {
      continue;
    }

    const missingRequiredItems = rawRequiredItems.flatMap(item => {
      const nextDemand = (requiredDemandByKind.get(item.kind) ?? 0) + item.quantity;
      requiredDemandByKind.set(item.kind, nextDemand);
      const fulfilled = fulfilledByKind.get(item.kind) ?? 0;
      const missingQuantity = Math.max(0, nextDemand - fulfilled);
      if (missingQuantity === 0) {
        return [];
      }

      return [{ ...item, quantity: missingQuantity }];
    });

    if (missingRequiredItems.length === 0) {
      continue;
    }

    const planned = buildCompanionInsertionPlan(component, missingRequiredItems, nextComponents);
    if (planned.length === 0) {
      continue;
    }

    nextComponents = [...nextComponents, ...planned];
    addedCount += planned.length;
    for (const item of missingRequiredItems) {
      fulfilledByKind.set(item.kind, (fulfilledByKind.get(item.kind) ?? 0) + item.quantity);
    }
    addedSummary.push({
      componentName: component.name,
      items: missingRequiredItems,
    });
  }

  return {
    components: nextComponents,
    pins: nextPins,
    manualConnections,
    addedCount,
    addedSummary,
  };
}

export function buildAiAppliedState(
  state: AiDesignApplicationState,
  result: AIConceptDesignResult
): AiDesignAppliedResult {
  const normalizedResult = normalizeAiConceptCompanionTopology(result);
  const validation = validateAiConceptDesignResult(normalizedResult);
  if (!validation.valid || !validation.data) {
    return { error: validation.errors.join(' / '), status: 'failed' };
  }

  const boardId = validation.data.board.id;
  const nextPins = getInitialPins(boardId);
  const nextComponents = validation.data.components.map(component => ({
    instanceId: component.instanceId,
    templateId: component.templateId,
    name: getTemplateById(component.templateId)?.name ?? component.templateId,
    position: component.position,
    rotation: component.rotation,
    assignedPins: {} as Record<string, string>,
    isFullyRouted: false,
  }));

  for (const connection of validation.data.connections) {
    const component = nextComponents.find(item => item.instanceId === connection.instanceId);
    const template = component ? getTemplateById(component.templateId) : undefined;
    const boardPin = nextPins[connection.boardPin];

    if (!component || !template || !boardPin) {
      return {
        error: `AI 연결 정보가 불완전합니다: ${connection.instanceId} / ${connection.boardPin}`,
        status: 'failed',
      };
    }

    const compatibility = validateBoardPinAssignment(template, connection.componentPin, boardPin);
    if (!compatibility.valid) {
      return { error: compatibility.error, status: 'manual-review-required' };
    }

    if (!isSharedBoardPin(connection.boardPin)) {
      if (nextPins[connection.boardPin].isUsed && nextPins[connection.boardPin].connectedTo !== component.instanceId) {
        return {
          error: `${connection.boardPin} 핀은 이미 다른 AI 부품 연결이 사용 중입니다.`,
          status: 'manual-review-required',
        };
      }

      nextPins[connection.boardPin] = {
        ...nextPins[connection.boardPin],
        isUsed: true,
        connectedTo: component.instanceId,
        assignmentMode: 'manual',
      };
    }

    component.assignedPins[connection.componentPin] = connection.boardPin;
  }

  for (const component of nextComponents) {
    const template = getTemplateById(component.templateId);
    if (!template) {
      return {
        error: `AI 결과에 알 수 없는 템플릿이 포함되어 있습니다: ${component.templateId}`,
        status: 'failed',
      };
    }
    component.isFullyRouted = isComponentFullyRouted(component, template);
  }

  const companionInsertion = autoInsertRequiredCompanions(nextComponents, boardId, nextPins);
  const finalizedComponents = companionInsertion.components;
  const finalizedPins = companionInsertion.pins;
  const finalizedManualConnections = companionInsertion.manualConnections;

  for (const component of finalizedComponents) {
    const template = getTemplateById(component.templateId);
    if (!template) {
      continue;
    }
    component.isFullyRouted = isComponentFullyRoutedWithManualConnections(component, template, finalizedManualConnections);
  }

  const drcReport = runProjectDrc({
    components: finalizedComponents,
    manualConnections: finalizedManualConnections,
    boardId,
    resolveTemplate: getTemplateById,
    powerInputMode: state.powerInputMode,
    componentPowerModes: {},
    generatedCode: validation.data.code,
    footprintPinPadOverrideCache: state.footprintPinPadOverrideCache,
  });
  const blockingIssues = drcReport.issues.filter(issue => issue.severity === 'error');
  const autocorrectSummary = companionInsertion.addedSummary
    .map(item => buildCompanionAutocorrectSummary(item.items, {
      prefixComponentName: item.componentName,
    }))
    .filter(Boolean)
    .join(' / ');
  if (blockingIssues.length > 0) {
    const manualReviewPrefix =
      companionInsertion.addedCount > 0
        ? `일부는 자동 보정했지만 아직 사람이 확인할 항목이 남아 있습니다. `
        : `자동 적용 전에 사람이 확인해야 하는 항목이 있습니다. `;

    return {
      error: `${manualReviewPrefix}${summarizeBlockingIssues(blockingIssues)}`,
      notice:
        companionInsertion.addedCount > 0
          ? `필수 동반 부품 ${companionInsertion.addedCount}개를 자동으로 추가했지만, 남은 전기 규칙 오류 때문에 적용은 멈췄습니다.${autocorrectSummary ? ` ${autocorrectSummary}` : ''}`
          : undefined,
      status: 'manual-review-required',
    };
  }

  const selectedComponentId = finalizedComponents[0]?.instanceId ?? 'board-node';
  const nextState: ProjectAppliedPartialState = {
    activeBoardId: boardId,
    pins: finalizedPins,
    components: finalizedComponents,
    manualConnections: finalizedManualConnections,
    generatedCode: validation.data.code,
    codeError: null,
    componentPowerModes: {},
    selectedComponentId,
    workspaceMode: 'simulation',
  };

  const nextSnapshot: ProjectHistorySnapshot = createHistorySnapshot({
    activeBoardId: boardId,
    pins: finalizedPins,
    components: finalizedComponents,
    manualConnections: finalizedManualConnections,
    powerInputMode: state.powerInputMode,
    componentPowerModes: {},
    workspaceMode: 'simulation',
    wiringMode: state.wiringMode,
    showGrid: state.showGrid,
    showMinimap: state.showMinimap,
    selectedComponentId,
  });

  const notice =
    companionInsertion.addedCount > 0
      ? `AI 설계에 필요한 필수 동반 부품 ${companionInsertion.addedCount}개를 자동으로 추가했습니다.${autocorrectSummary ? ` ${autocorrectSummary}` : ''}`
      : undefined;

  return {
    nextState,
    nextSnapshot,
    notice,
    status: companionInsertion.addedCount > 0 ? 'applied-with-autocorrect' : 'applied',
  };
}
