import { getBoardById } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import { normalizeAiConceptLayout } from '@/lib/ai-concept-layout';
import { customComponentPackageToTemplate } from '@/lib/custom-component-packages';
import { generateLocalFallbackCode } from '@/lib/fallback-generator';
import type {
  AIConceptConnectionDraft,
  AIConceptDesignContext,
  AIConceptDesignResult,
  AICodeGenerationPayload,
  CustomComponentPackage,
} from '@/types';

const KEYWORD_COMPONENTS: Array<{ templateId: string; keywords: string[] }> = [
  { templateId: 'tpl_dht22', keywords: ['온습도', '습도', 'temperature', 'humidity', '기후'] },
  { templateId: 'tpl_soil_moisture', keywords: ['토양', '수분', 'soil', 'moisture', '화분'] },
  { templateId: 'tpl_dc_motor', keywords: ['펌프', 'pump', '모터', 'motor'] },
  { templateId: 'tpl_relay', keywords: ['릴레이', 'relay'] },
  { templateId: 'tpl_led', keywords: ['led', '램프', '불빛', '조명'] },
  { templateId: 'tpl_button', keywords: ['버튼', '스위치', 'button'] },
  { templateId: 'tpl_buzzer', keywords: ['부저', '알람', 'buzzer'] },
  { templateId: 'tpl_photoresistor', keywords: ['조도', '빛', '밝기', 'light'] },
  { templateId: 'tpl_ultrasonic', keywords: ['거리', '초음파', 'ultrasonic'] },
  { templateId: 'tpl_oled', keywords: ['oled', '디스플레이', '표시'] },
];

const DEFAULT_TEMPLATE_IDS = ['tpl_dht22', 'tpl_led'];

function findTemplateById(templateId: string, customComponents: CustomComponentPackage[] = []) {
  const coreTemplate = getTemplateById(templateId);
  if (coreTemplate) {
    return coreTemplate;
  }

  const customPackage = customComponents.find(component => component.templateId === templateId);
  return customPackage ? customComponentPackageToTemplate(customPackage) : undefined;
}

function inferBoardId(concept: string, preferredBoardId?: string, currentDesign?: AIConceptDesignContext) {
  const lower = concept.toLowerCase();
  if (lower.includes('esp32')) return 'esp32';
  if (lower.includes('라즈베리') || lower.includes('raspberry')) return 'rpi4';
  if (lower.includes('nano')) return 'nano';
  return currentDesign?.boardId ?? preferredBoardId ?? 'uno';
}

function inferTemplateIds(concept: string, customComponents: CustomComponentPackage[] = []) {
  const lower = concept.toLowerCase();
  const matched = KEYWORD_COMPONENTS
    .filter(entry => entry.keywords.some(keyword => lower.includes(keyword)))
    .map(entry => entry.templateId);

  const customMatches = customComponents
    .filter(component => {
      const nameMatch = component.name.toLowerCase().includes(lower) || lower.includes(component.name.toLowerCase());
      const description = component.description?.toLowerCase() ?? '';
      const descriptionMatch = description.length > 0 && lower.includes(description);
      return nameMatch || descriptionMatch;
    })
    .map(component => component.templateId);

  const combined = [...matched, ...customMatches];
  return Array.from(new Set(combined.length > 0 ? combined : DEFAULT_TEMPLATE_IDS)).slice(0, 5);
}

function pickBoardPin(templateId: string, componentPin: string, boardId: string, usedPins: Set<string>) {
  const board = getBoardById(boardId);

  if (componentPin === 'VCC') {
    return board.logicVoltage === '3.3V' ? '3.3V' : '5V';
  }
  if (componentPin === 'GND') {
    return 'GND';
  }

  const digitalPool = [...board.digitalPins, ...board.leftPins.filter(pin => pin.startsWith('A'))];
  const analogPool = [...board.leftPins.filter(pin => pin.startsWith('A')), ...board.digitalPins];
  const pwmPool = board.pinDefinitions.filter(pin => pin.type.includes('PWM')).map(pin => pin.id);

  const preferredPool =
    componentPin === 'AOut'
      ? analogPool
      : componentPin === 'Signal' && templateId === 'tpl_servo'
        ? pwmPool
        : ['R', 'G', 'B', 'ENA'].includes(componentPin)
          ? pwmPool
          : digitalPool;

  const available = preferredPool.find(pin => !usedPins.has(pin) && !['5V', '3.3V', 'GND'].includes(pin));
  if (!available) {
    return preferredPool.find(pin => !['5V', '3.3V', 'GND'].includes(pin)) ?? board.digitalPins[0] ?? board.leftPins[0] ?? 'D2';
  }

  usedPins.add(available);
  return available;
}

function toCodePayload(
  result: AIConceptDesignResult,
  customComponents: CustomComponentPackage[] = []
): AICodeGenerationPayload {
  const board = getBoardById(result.board.id);
  const connectedComponents = result.components.map(component => {
    const template = findTemplateById(component.templateId, customComponents);
    const pinConnections = Object.fromEntries(
      result.connections
        .filter(connection => connection.instanceId === component.instanceId)
        .map(connection => [connection.componentPin, connection.boardPin])
    );

    return {
      templateId: component.templateId,
      componentName: template?.name ?? component.templateId,
      pinConnections,
      librarySource: template?.librarySource,
      libraryIncludes: template?.libraryIncludes,
      dependencies: template?.dependencies,
      aiHints: template?.aiHints,
    };
  });

  return {
    boardId: board.id,
    boardName: board.name,
    chipset: board.chipset,
    targetLanguage: board.targetLanguage,
    connectedComponents,
  };
}

export function generateLocalConceptDesign(
  concept: string,
  preferredBoardId?: string,
  currentDesign?: AIConceptDesignContext,
  customComponents: CustomComponentPackage[] = []
): AIConceptDesignResult {
  const boardId = inferBoardId(concept, preferredBoardId, currentDesign);
  const inferredTemplateIds = inferTemplateIds(concept, customComponents);
  const existingTemplateIds = new Set(currentDesign?.components.map(component => component.templateId) ?? []);
  const templateIds = inferredTemplateIds.filter(templateId => !existingTemplateIds.has(templateId));
  const usedPins = new Set<string>(currentDesign?.usedBoardPins ?? []);
  const connections: AIConceptConnectionDraft[] = [];
  const existingComponents = (currentDesign?.components ?? []).map(component => ({
    instanceId: component.instanceId,
    templateId: component.templateId,
    position: component.position,
    rotation: component.rotation,
    assignedPins: {},
  }));
  const nextIndexBase = existingComponents.length;

  const components = [
    ...existingComponents,
    ...templateIds.map((templateId, index) => ({
      instanceId: `c${nextIndexBase + index + 1}`,
      templateId,
      position: {
        x: 120 + ((nextIndexBase + index) % 3) * 180,
        y: 90 + Math.floor((nextIndexBase + index) / 3) * 160,
      },
      rotation: 0 as const,
      assignedPins: {},
    })),
  ];

  for (const component of currentDesign?.components ?? []) {
    for (const [componentPin, boardPin] of Object.entries(component.assignedPins)) {
      connections.push({
        instanceId: component.instanceId,
        componentPin,
        boardPin,
      });
    }
  }

  for (const component of components.slice(existingComponents.length)) {
    const template = findTemplateById(component.templateId, customComponents);
    if (!template) continue;

    for (const requiredPin of template.requiredPins) {
      const boardPin = pickBoardPin(template.id, requiredPin.name, boardId, usedPins);
      connections.push({
        instanceId: component.instanceId,
        componentPin: requiredPin.name,
        boardPin,
      });
    }
  }

  const result = normalizeAiConceptLayout({
    board: { id: boardId },
    components,
    connections,
    code: '',
    meta: {
      provider: 'local',
      model: 'local-concept-fallback-v1',
      label: 'Local 설계',
    },
  }, currentDesign);

  result.code = generateLocalFallbackCode({
    ...toCodePayload(result, customComponents),
    userIntent: concept,
  });

  return result;
}
