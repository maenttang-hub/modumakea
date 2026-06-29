import {
  collectCppReviewArtifacts,
  collectPythonReviewArtifacts,
  looksLikeCppCode,
  normalizeBoardPin,
  stripCppComments,
  type ParsedCppOperation,
} from '@/lib/ast-parser';
import type {
  DatasheetReviewCodePinUsage,
  DatasheetReviewComponentInput,
  DatasheetReviewNetInput,
} from '@/types';

function dedupeStrings(values: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    if (!raw) {
      continue;
    }
    const value = raw.trim().replace(/\s+/g, ' ');
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }

  return result;
}

function collectCodeOperations(sourceCode: string | undefined, boardId: string) {
  if (!sourceCode || !sourceCode.trim()) {
    return [] as ParsedCppOperation[];
  }

  return looksLikeCppCode(sourceCode)
    ? collectCppReviewArtifacts(sourceCode, boardId).operations
    : collectPythonReviewArtifacts(sourceCode, boardId).operations;
}

function fallbackBoardPinToken(rawToken: string, boardId: string) {
  const cleaned = rawToken.trim().replace(/^['"]|['"]$/g, '');
  if (!cleaned) {
    return null;
  }

  const normalized = normalizeBoardPin(boardId, cleaned);
  if (normalized) {
    return normalized;
  }

  if (/^(GPIO\d+|G\d+|D\d+|A\d+)$/i.test(cleaned)) {
    return cleaned.toUpperCase();
  }

  return /^[A-Za-z_]\w*$/.test(cleaned) ? cleaned : null;
}

function collectFallbackCppOperations(sourceCode: string | undefined, boardId: string) {
  if (!sourceCode || !sourceCode.trim()) {
    return [] as ParsedCppOperation[];
  }

  const sanitized = stripCppComments(sourceCode);
  const operations: ParsedCppOperation[] = [];
  const callPattern =
    /\b(pinMode|digitalWrite|analogWrite|digitalRead|analogRead)\s*\(\s*([A-Za-z_]\w*|['"][^'"]+['"]|\d+)\s*(?:,\s*([A-Za-z_]\w*|['"][^'"]+['"]|\d+))?/g;

  for (const match of sanitized.matchAll(callPattern)) {
    const rawType = match[1];
    const rawPin = match[2];

    if (!rawType || !rawPin || match.index == null) {
      continue;
    }

    const boardPin = fallbackBoardPinToken(rawPin, boardId);
    if (!boardPin) {
      continue;
    }

    const line = sanitized.slice(0, match.index).split('\n').length;
    if (rawType === 'pinMode') {
      operations.push({
        type: 'pinMode',
        boardPin,
        mode: match[3]?.trim().replace(/^['"]|['"]$/g, '') ?? 'UNKNOWN',
        line,
        scope: 'other',
      });
      continue;
    }

    operations.push({
      type: rawType,
      boardPin,
      value: match[3]?.trim().replace(/^['"]|['"]$/g, ''),
      line,
      scope: 'other',
    } as ParsedCppOperation);
  }

  return operations;
}

function inferAnalysisBoardId(params: {
  boardId: string;
  components: DatasheetReviewComponentInput[];
  nets: DatasheetReviewNetInput[];
}) {
  if (['uno', 'nano', 'esp32', 'rpi4'].includes(params.boardId)) {
    return params.boardId;
  }

  const knownPins = dedupeStrings([
    ...params.components.flatMap(component =>
      component.pins.map(pin => pin.assignedBoardPin)
    ),
    ...params.nets.flatMap(net =>
      net.memberRefs
        .filter(member => member.ownerType === 'board')
        .map(member => member.pinId)
    ),
  ]);

  if (knownPins.some(pin => /^GPIO\d+$/i.test(pin))) {
    return 'rpi4';
  }
  if (knownPins.some(pin => /^G\d+$/i.test(pin))) {
    return 'esp32';
  }
  if (knownPins.some(pin => /^D\d+$|^A\d+$/i.test(pin))) {
    return 'uno';
  }

  return params.boardId;
}

function buildConnectedComponentLookup(
  components: DatasheetReviewComponentInput[],
  nets: DatasheetReviewNetInput[]
) {
  const componentById = new Map(components.map(component => [component.instanceId, component]));
  const byBoardPin = new Map<string, { netLabels: string[]; componentReferences: string[] }>();

  for (const net of nets) {
    const boardPinMembers = net.memberRefs.filter(member => member.ownerType === 'board');
    if (boardPinMembers.length === 0) {
      continue;
    }

    const componentReferences = dedupeStrings(
      net.memberRefs
        .filter(member => member.ownerType === 'component')
        .map(member => componentById.get(member.ownerId)?.reference)
    );
    const netLabels = dedupeStrings([net.label]);

    for (const member of boardPinMembers) {
      byBoardPin.set(member.pinId, {
        netLabels,
        componentReferences,
      });
    }
  }

  return byBoardPin;
}

export function mergeCodePinUsage(params: {
  sourceCode?: string;
  boardId: string;
  components: DatasheetReviewComponentInput[];
  nets: DatasheetReviewNetInput[];
}): DatasheetReviewCodePinUsage[] {
  const analysisBoardId = inferAnalysisBoardId(params);
  const primaryOperations = collectCodeOperations(params.sourceCode, analysisBoardId);
  const fallbackCppOperations = looksLikeCppCode(params.sourceCode ?? '')
    ? collectFallbackCppOperations(params.sourceCode, analysisBoardId)
    : [];
  const operations = [...primaryOperations];
  const seenOperations = new Set(
    primaryOperations.map(operation => `${operation.type}:${operation.boardPin}:${operation.line}`)
  );

  for (const operation of fallbackCppOperations) {
    const key = `${operation.type}:${operation.boardPin}:${operation.line}`;
    if (seenOperations.has(key)) {
      continue;
    }
    seenOperations.add(key);
    operations.push(operation);
  }

  const connectedBoardPins = new Set(
    params.components.flatMap(component =>
      component.pins
        .map(pin => pin.assignedBoardPin)
        .filter((value): value is string => Boolean(value))
    )
  );
  const boardPinLookup = buildConnectedComponentLookup(params.components, params.nets);

  return operations.map(operation => {
    const connected = boardPinLookup.get(operation.boardPin);

    return {
      operationType: operation.type,
      pinArgument: operation.boardPin,
      matchedMcuPinLabel: connectedBoardPins.has(operation.boardPin) ? operation.boardPin : null,
      lineNumber: operation.line,
      scope: operation.scope,
      mode: 'mode' in operation ? operation.mode : undefined,
      value: 'value' in operation ? operation.value : undefined,
      conditional: Boolean(operation.conditional),
      conditions: operation.conditions ?? [],
      callPath: operation.callPath ?? [],
      connectedNetLabels: connected?.netLabels ?? [],
      connectedComponentReferences: connected?.componentReferences ?? [],
    };
  });
}
