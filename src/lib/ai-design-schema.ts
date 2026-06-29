import { BOARD_REGISTRY } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import { isSharedBoardPin, validateBoardPinAssignment } from '@/lib/pin-compatibility';
import type {
  AIConceptComponentDraft,
  AIConceptConnectionDraft,
  AIConceptDesignMeta,
  AIConceptDesignResult,
} from '@/types';

const ALLOWED_ROTATIONS = new Set([0, 90, 180, 270]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateComponentDraft(component: unknown, errors: string[]): component is AIConceptComponentDraft {
  const initialErrorCount = errors.length;
  if (!isPlainObject(component)) {
    errors.push('components 항목은 객체여야 합니다.');
    return false;
  }

  if (typeof component.instanceId !== 'string' || component.instanceId.trim() === '') {
    errors.push('components.instanceId는 비어 있지 않은 문자열이어야 합니다.');
  }

  if (typeof component.templateId !== 'string' || component.templateId.trim() === '') {
    errors.push(`component ${String(component.instanceId ?? '?')}의 templateId가 비어 있습니다.`);
  }

  const position = component.position;
  if (!isPlainObject(position) || !Number.isInteger(position.x) || !Number.isInteger(position.y)) {
    errors.push(`component ${String(component.instanceId ?? '?')}의 position은 정수 x/y 좌표여야 합니다.`);
  }

  if (!ALLOWED_ROTATIONS.has(Number(component.rotation))) {
    errors.push(`component ${String(component.instanceId ?? '?')}의 rotation은 0/90/180/270 중 하나여야 합니다.`);
  }

  if (!isPlainObject(component.assignedPins)) {
    errors.push(`component ${String(component.instanceId ?? '?')}의 assignedPins는 객체여야 합니다.`);
  }

  return errors.length === initialErrorCount;
}

function validateConnectionDraft(connection: unknown, errors: string[]): connection is AIConceptConnectionDraft {
  const initialErrorCount = errors.length;
  if (!isPlainObject(connection)) {
    errors.push('connections 항목은 객체여야 합니다.');
    return false;
  }

  if (typeof connection.instanceId !== 'string' || connection.instanceId.trim() === '') {
    errors.push('connections.instanceId는 비어 있지 않은 문자열이어야 합니다.');
  }

  if (typeof connection.componentPin !== 'string' || connection.componentPin.trim() === '') {
    errors.push(`connection ${String(connection.instanceId ?? '?')}의 componentPin이 비어 있습니다.`);
  }

  if (typeof connection.boardPin !== 'string' || connection.boardPin.trim() === '') {
    errors.push(`connection ${String(connection.instanceId ?? '?')}의 boardPin이 비어 있습니다.`);
  }

  return errors.length === initialErrorCount;
}

function validateConceptMeta(meta: unknown, errors: string[]): meta is AIConceptDesignMeta {
  const initialErrorCount = errors.length;
  if (!isPlainObject(meta)) {
    errors.push('meta는 객체여야 합니다.');
    return false;
  }

  if (!['gemini', 'anthropic', 'local'].includes(String(meta.provider))) {
    errors.push('meta.provider는 gemini/anthropic/local 중 하나여야 합니다.');
  }

  if (typeof meta.model !== 'string' || meta.model.trim() === '') {
    errors.push('meta.model은 비어 있지 않은 문자열이어야 합니다.');
  }

  if (typeof meta.label !== 'string' || meta.label.trim() === '') {
    errors.push('meta.label은 비어 있지 않은 문자열이어야 합니다.');
  }

  if (meta.fallback !== undefined && typeof meta.fallback !== 'boolean') {
    errors.push('meta.fallback은 boolean이어야 합니다.');
  }

  return errors.length === initialErrorCount;
}

export function validateAiConceptDesignResult(value: unknown): { valid: boolean; errors: string[]; data?: AIConceptDesignResult } {
  const errors: string[] = [];

  if (!isPlainObject(value)) {
    return { valid: false, errors: ['응답 본문은 객체(JSON object)여야 합니다.'] };
  }

  if (!isPlainObject(value.board) || typeof value.board.id !== 'string' || value.board.id.trim() === '') {
    errors.push('board.id는 비어 있지 않은 문자열이어야 합니다.');
  }

  const boardId = isPlainObject(value.board) && typeof value.board.id === 'string' ? value.board.id : 'uno';
  const board = BOARD_REGISTRY[boardId];
  if (!board?.id) {
    errors.push(`지원하지 않는 board.id입니다: ${boardId}`);
  }

  if (!Array.isArray(value.components)) {
    errors.push('components는 배열이어야 합니다.');
  }

  if (!Array.isArray(value.connections)) {
    errors.push('connections는 배열이어야 합니다.');
  }

  if (typeof value.code !== 'string') {
    errors.push('code는 문자열이어야 합니다.');
  }

  if (value.meta !== undefined) {
    validateConceptMeta(value.meta, errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const instanceIds = new Set<string>();
  const components = value.components as unknown[];
  for (const component of components) {
    const before = errors.length;
    if (!validateComponentDraft(component, errors)) {
      continue;
    }

    if (instanceIds.has(component.instanceId)) {
      errors.push(`중복된 component instanceId가 있습니다: ${component.instanceId}`);
    } else {
      instanceIds.add(component.instanceId);
    }

    if (!getTemplateById(component.templateId)) {
      errors.push(`존재하지 않는 templateId입니다: ${component.templateId}`);
    }

    if (Object.keys(component.assignedPins).length > 0) {
      errors.push(`component ${component.instanceId}의 assignedPins는 비워 둬야 합니다.`);
    }

    if (errors.length > before) {
      continue;
    }
  }

  const occupiedBoardPins = new Map<string, string>();
  const connections = value.connections as unknown[];
  for (const connection of connections) {
    if (!validateConnectionDraft(connection, errors)) {
      continue;
    }

    if (!instanceIds.has(connection.instanceId)) {
      errors.push(`connections에 알 수 없는 instanceId가 있습니다: ${connection.instanceId}`);
      continue;
    }

    const component = components.find(item => isPlainObject(item) && item.instanceId === connection.instanceId) as AIConceptComponentDraft | undefined;
    const template = component ? getTemplateById(component.templateId) : undefined;
    if (!template) {
      errors.push(`connection ${connection.instanceId}의 템플릿을 찾을 수 없습니다.`);
      continue;
    }

    const boardPin = board?.pinDefinitions.find(pin => pin.id === connection.boardPin);
    if (!boardPin) {
      errors.push(`board ${board.id}에는 ${connection.boardPin} 핀이 없습니다.`);
      continue;
    }

    if (!template.requiredPins.some(pin => pin.name === connection.componentPin)) {
      errors.push(`${template.name}에는 ${connection.componentPin} 핀이 없습니다.`);
      continue;
    }

    const compatibility = validateBoardPinAssignment(template, connection.componentPin, boardPin);
    if (!compatibility.valid) {
      errors.push(compatibility.error);
      continue;
    }

    if (!isSharedBoardPin(connection.boardPin)) {
      const existingOwner = occupiedBoardPins.get(connection.boardPin);
      if (existingOwner && existingOwner !== connection.instanceId) {
        errors.push(`${connection.boardPin} 핀이 ${existingOwner}와 ${connection.instanceId}에 중복 배정되었습니다.`);
        continue;
      }
      occupiedBoardPins.set(connection.boardPin, connection.instanceId);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: value as unknown as AIConceptDesignResult,
  };
}
