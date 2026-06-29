import {
  buildCppAliasMap,
  buildPythonAliasMap,
  collectCppReviewArtifacts,
  collectPythonReviewArtifacts,
  looksLikeCppCode,
  resolvePinReference,
  type CppCallCapture,
  type ParsedCppOperation,
} from '@/lib/ast-parser';
import type { FormalVerificationIssue, PlacedComponent, WarningSeverity } from '@/types';

export interface CodePinMatchLineTokenHint {
  lineNumber: number;
  tokens: string[];
}

export interface CodePinMatchRow {
  id: string;
  boardPin: string;
  sourceNames: string[];
  primarySourceName?: string;
  operationTypes: string[];
  lineNumbers: number[];
  lineTokenHints: CodePinMatchLineTokenHint[];
  linePreview?: string;
  componentNames: string[];
  componentInstanceIds: string[];
  componentPins: string[];
  primaryComponentPin?: string;
  status: 'matched' | 'unwired';
  severity: WarningSeverity | null;
  issueCount: number;
  reason?: string;
  recommendation?: string;
  primaryRuleId?: string;
}

function dedupeStrings(values: Array<string | undefined | null>) {
  return Array.from(
    new Set(
      values
        .map(value => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );
}

function dedupeNumbers(values: number[]) {
  return Array.from(new Set(values.filter(value => Number.isFinite(value)))).sort((left, right) => left - right);
}

function severityRank(severity: WarningSeverity) {
  switch (severity) {
    case 'error':
      return 3;
    case 'warning':
      return 2;
    case 'info':
    default:
      return 1;
  }
}

function summarizeOperation(operation: ParsedCppOperation) {
  if (operation.type === 'pinMode') {
    return `pinMode:${operation.mode}`;
  }

  return operation.type;
}

function collectReviewContext(sourceCode: string, boardId: string) {
  if (looksLikeCppCode(sourceCode)) {
    const artifacts = collectCppReviewArtifacts(sourceCode, boardId);
    return {
      operations: artifacts.operations,
      aliases: buildCppAliasMap(sourceCode, boardId),
      callCaptures: artifacts.parseTree?.calls ?? [] as CppCallCapture[],
    };
  }

  const artifacts = collectPythonReviewArtifacts(sourceCode, boardId);
  return {
    operations: artifacts.operations,
    aliases: buildPythonAliasMap(sourceCode, boardId),
    callCaptures: artifacts.parseTree.calls ?? [] as CppCallCapture[],
  };
}

function collectLineTokenHints(params: {
  boardId: string;
  aliases: Map<string, string>;
  callCaptures: CppCallCapture[];
}) {
  const { boardId, aliases, callCaptures } = params;
  const byPinAndLine = new Map<string, string[]>();

  for (const capture of callCaptures) {
    if (!['pinMode', 'digitalWrite', 'analogWrite', 'digitalRead', 'analogRead'].includes(capture.name)) {
      continue;
    }

    const pinArgument = capture.arguments[0];
    if (!pinArgument?.value) {
      continue;
    }

    const boardPin = resolvePinReference(pinArgument.value, boardId, aliases);
    if (!boardPin) {
      continue;
    }

    const normalizedToken =
      pinArgument.kind === 'identifier'
        ? pinArgument.value
        : pinArgument.value.replace(/^['"]|['"]$/g, '').trim();
    const key = `${boardPin}:${capture.line}`;
    const current = byPinAndLine.get(key) ?? [];
    byPinAndLine.set(key, dedupeStrings([...current, normalizedToken]));
  }

  return byPinAndLine;
}

export function buildCodePinMatches(params: {
  sourceCode: string;
  boardId: string;
  components: PlacedComponent[];
  issues: FormalVerificationIssue[];
}) {
  const { sourceCode, boardId, components, issues } = params;
  if (!sourceCode.trim()) {
    return [] as CodePinMatchRow[];
  }

  const { operations, aliases, callCaptures } = collectReviewContext(sourceCode, boardId);
  const lines = sourceCode.split(/\r?\n/);
  const lineTokenHintsByPin = collectLineTokenHints({
    boardId,
    aliases,
    callCaptures,
  });
  const aliasNamesByPin = new Map<string, string[]>();

  for (const [aliasName, boardPin] of aliases.entries()) {
    const current = aliasNamesByPin.get(boardPin) ?? [];
    current.push(aliasName);
    aliasNamesByPin.set(boardPin, dedupeStrings(current));
  }

  const pinConnections = new Map<
    string,
    {
      componentNames: string[];
      componentInstanceIds: string[];
      componentPins: string[];
    }
  >();

  for (const component of components) {
    for (const [componentPin, boardPin] of Object.entries(component.assignedPins)) {
      const current = pinConnections.get(boardPin) ?? {
        componentNames: [],
        componentInstanceIds: [],
        componentPins: [],
      };
      current.componentNames.push(component.name);
      current.componentInstanceIds.push(component.instanceId);
      current.componentPins.push(componentPin);
      pinConnections.set(boardPin, {
        componentNames: dedupeStrings(current.componentNames),
        componentInstanceIds: dedupeStrings(current.componentInstanceIds),
        componentPins: dedupeStrings(current.componentPins),
      });
    }
  }

  const issuesByPin = new Map<string, FormalVerificationIssue[]>();
  for (const issue of issues) {
    if (!issue.boardPin) {
      continue;
    }
    const current = issuesByPin.get(issue.boardPin) ?? [];
    current.push(issue);
    issuesByPin.set(issue.boardPin, current);
  }

  const groupedByPin = new Map<
    string,
    {
      operations: ParsedCppOperation[];
      lineNumbers: number[];
      operationTypes: string[];
    }
  >();

  for (const operation of operations) {
    const current = groupedByPin.get(operation.boardPin) ?? {
      operations: [],
      lineNumbers: [],
      operationTypes: [],
    };
    current.operations.push(operation);
    current.lineNumbers.push(operation.line);
    current.operationTypes.push(summarizeOperation(operation));
    groupedByPin.set(operation.boardPin, current);
  }

  return Array.from(groupedByPin.entries())
    .map(([boardPin, group]) => {
      const connection = pinConnections.get(boardPin);
      const pinIssues = issuesByPin.get(boardPin) ?? [];
      const severity = pinIssues.reduce<WarningSeverity | null>((current, issue) => {
        if (!current || severityRank(issue.severity) > severityRank(current)) {
          return issue.severity;
        }
        return current;
      }, null);
      const lineNumbers = dedupeNumbers(group.lineNumbers);
      const firstLine = lineNumbers[0];
      const preview = firstLine ? lines[firstLine - 1]?.trim() : '';
      const primaryIssue = pinIssues
        .slice()
        .sort((left, right) => severityRank(right.severity) - severityRank(left.severity))[0];

      return {
        id: `${boardPin}:${lineNumbers.join(',')}`,
        boardPin,
        sourceNames: aliasNamesByPin.get(boardPin) ?? [],
        primarySourceName: aliasNamesByPin.get(boardPin)?.[0],
        operationTypes: dedupeStrings(group.operationTypes),
        lineNumbers,
        lineTokenHints: lineNumbers.map(lineNumber => ({
          lineNumber,
          tokens: lineTokenHintsByPin.get(`${boardPin}:${lineNumber}`) ?? [],
        })),
        linePreview: preview,
        componentNames: connection?.componentNames ?? [],
        componentInstanceIds: connection?.componentInstanceIds ?? [],
        componentPins: connection?.componentPins ?? [],
        primaryComponentPin: connection?.componentPins?.[0],
        status: connection ? 'matched' : 'unwired',
        severity,
        issueCount: pinIssues.length,
        reason: primaryIssue?.message,
        recommendation: primaryIssue?.recommendation,
        primaryRuleId: primaryIssue?.ruleId,
      } satisfies CodePinMatchRow;
    })
    .sort((left, right) => {
      const leftLine = left.lineNumbers[0] ?? Number.MAX_SAFE_INTEGER;
      const rightLine = right.lineNumbers[0] ?? Number.MAX_SAFE_INTEGER;
      return leftLine - rightLine || left.boardPin.localeCompare(right.boardPin);
    });
}
