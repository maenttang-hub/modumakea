import { getBoardById } from '@/constants/boards';
import type { TargetLanguage } from '@/constants/boards';
import {
  collectCppReviewArtifacts,
  collectPythonReviewArtifacts,
  looksLikeCppCode,
  type ParsedCppOperation,
} from '@/lib/ast-parser';
import type { ComponentRuntimeState, PlacedComponent } from '@/types';

const ACTIVE_TEMPLATE_IDS = new Set([
  'tpl_led',
  'tpl_rgb_led',
  'tpl_buzzer',
  'tpl_relay',
  'tpl_servo',
  'tpl_dc_motor',
]);

type RuntimeSignal = 'idle' | 'active' | 'pulse';

function normalizeBoardPin(boardId: string, token: string) {
  const board = getBoardById(boardId);
  const cleaned = token.trim().replace(/['"]/g, '');
  if (!cleaned) {
    return null;
  }

  const candidates = new Set<string>([
    cleaned,
    cleaned.toUpperCase(),
    cleaned.replace(/^GPIO/i, 'GPIO'),
    cleaned.replace(/^G/i, 'G'),
  ]);

  if (/^\d+$/.test(cleaned)) {
    candidates.add(`D${cleaned}`);
    candidates.add(`GPIO${cleaned}`);
    candidates.add(`G${cleaned}`);
    candidates.add(`A${cleaned}`);
  }

  for (const candidate of candidates) {
    if (board.pinDefinitions.some(pin => pin.id === candidate)) {
      return candidate;
    }
  }

  return null;
}

function buildCppAliasMap(code: string, boardId: string) {
  const aliases = new Map<string, string>();
  const defineRegex = /^\s*#define\s+([A-Za-z_]\w*)\s+([A-Za-z0-9_.]+)/gm;
  const constRegex = /^\s*const\s+(?:uint8_t|int|byte|auto|unsigned\s+int)\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z0-9_.]+)/gm;

  for (const regex of [defineRegex, constRegex]) {
    for (const match of code.matchAll(regex)) {
      const alias = match[1];
      const resolvedPin = normalizeBoardPin(boardId, match[2] ?? '');
      if (alias && resolvedPin) {
        aliases.set(alias, resolvedPin);
      }
    }
  }

  return aliases;
}

function resolvePinReference(rawReference: string, boardId: string, aliases: Map<string, string>) {
  const cleaned = rawReference.trim();
  return aliases.get(cleaned) ?? normalizeBoardPin(boardId, cleaned);
}

function applyOperationSignal(signalByPin: Map<string, RuntimeSignal>, operation: ParsedCppOperation) {
  if (operation.type !== 'digitalWrite' && operation.type !== 'analogWrite') {
    return;
  }

  const nextState: RuntimeSignal =
    operation.type === 'analogWrite'
      ? 'pulse'
      : operation.value === 'LOW'
        ? 'idle'
        : 'active';
  const previous = signalByPin.get(operation.boardPin);

  signalByPin.set(
    operation.boardPin,
    previous && previous !== nextState ? 'pulse' : nextState
  );
}

function collectCppSignals(code: string, boardId: string) {
  const aliases = buildCppAliasMap(code, boardId);
  const signalByPin = new Map<string, RuntimeSignal>();

  for (const operation of collectCppReviewArtifacts(code, boardId).operations) {
    applyOperationSignal(signalByPin, operation);
  }

  const toneRegex = /tone\s*\(\s*([A-Za-z0-9_]+)\s*,/g;
  for (const match of code.matchAll(toneRegex)) {
    const pin = resolvePinReference(match[1] ?? '', boardId, aliases);
    if (!pin) {
      continue;
    }
    signalByPin.set(pin, 'pulse');
  }

  return signalByPin;
}

function collectPythonSignals(code: string, boardId: string) {
  const signalByPin = new Map<string, RuntimeSignal>();

  for (const operation of collectPythonReviewArtifacts(code, boardId).operations) {
    applyOperationSignal(signalByPin, operation);
  }

  return signalByPin;
}

function buildLabelForPin(pinId: string, mode: RuntimeSignal) {
  if (mode === 'pulse') {
    return `${pinId} 펄스`;
  }
  if (mode === 'active') {
    return `${pinId} 활성`;
  }
  return `${pinId} 대기`;
}

export function deriveRuntimeComponentStates(params: {
  boardId: string;
  targetLanguage: TargetLanguage;
  code: string;
  components: PlacedComponent[];
}) {
  const { boardId, targetLanguage, code, components } = params;
  const signalByPin =
    targetLanguage === 'Python' && !looksLikeCppCode(code)
      ? collectPythonSignals(code, boardId)
      : collectCppSignals(code, boardId);

  const nextStates: Record<string, ComponentRuntimeState> = {};

  for (const component of components) {
    if (!ACTIVE_TEMPLATE_IDS.has(component.templateId)) {
      continue;
    }

    const matchedPin = Object.values(component.assignedPins).find(boardPin => signalByPin.has(boardPin));
    if (!matchedPin) {
      continue;
    }

    const mode = signalByPin.get(matchedPin);
    if (!mode || mode === 'idle') {
      continue;
    }

    nextStates[component.instanceId] = {
      mode,
      label: buildLabelForPin(matchedPin, mode),
    };
  }

  return nextStates;
}
