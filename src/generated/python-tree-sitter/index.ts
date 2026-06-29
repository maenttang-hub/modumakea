import {
  collectPythonCallCaptures,
  getLineNumber,
  hasObviousPythonSyntaxError,
  normalizeBoardPin,
  stripPythonComments,
  type CodeScope,
  type ParsedCppOperation,
  type PythonCallCapture,
} from '@/lib/ast-parser-core';
import type { PythonParseTree, PythonReviewArtifacts } from '@/lib/ast-parser';
import type { ModuMakePythonAstBindings } from '@/lib/python-ast-provider';
import { loadVendoredPythonTreeSitterBindings } from './vendor/index';

type PythonBlockContext =
  | {
      kind: 'function';
      indent: number;
      name: string;
    }
  | {
      kind: 'class';
      indent: number;
      name: string;
    }
  | {
      kind: 'condition';
      indent: number;
      label: string;
    };

type PythonLineContext = {
  scope: CodeScope;
  conditions: string[];
  callPath: string[];
};

function getIndentWidth(line: string) {
  const match = line.match(/^\s*/)?.[0] ?? '';
  return match.replace(/\t/g, '    ').length;
}

function resolvePythonScope(functionName?: string): CodeScope {
  if (!functionName) {
    return 'other';
  }

  if (functionName === 'setup') {
    return 'setup';
  }

  if (functionName === 'loop') {
    return 'loop';
  }

  return 'other';
}

function buildPythonLineContexts(source: string) {
  const sanitizedSource = stripPythonComments(source);
  const lines = sanitizedSource.split(/\r?\n/);
  const stack: PythonBlockContext[] = [];
  const contexts = new Map<number, PythonLineContext>();

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();
    const indent = getIndentWidth(rawLine);

    if (!trimmed) {
      contexts.set(lineNumber, { scope: 'other', conditions: [], callPath: [] });
      continue;
    }

    while (stack.length > 0 && indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }

    const currentFunction = [...stack].reverse().find(context => context.kind === 'function');
    const conditions = stack
      .filter((context): context is Extract<PythonBlockContext, { kind: 'condition' }> => context.kind === 'condition')
      .map(context => context.label);
    const callPath = stack.map(context => (
      context.kind === 'condition'
        ? context.label
        : context.name
    ));

    contexts.set(lineNumber, {
      scope: resolvePythonScope(currentFunction?.name),
      conditions,
      callPath,
    });

    const functionMatch = trimmed.match(/^def\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*:/);
    if (functionMatch?.[1]) {
      stack.push({
        kind: 'function',
        indent,
        name: functionMatch[1],
      });
      continue;
    }

    const classMatch = trimmed.match(/^class\s+([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*:/);
    if (classMatch?.[1]) {
      stack.push({
        kind: 'class',
        indent,
        name: classMatch[1],
      });
      continue;
    }

    const conditionMatch = trimmed.match(/^(if|elif|else|while|for)\b(.*):$/);
    if (conditionMatch?.[1]) {
      const keyword = conditionMatch[1];
      const body = conditionMatch[2]?.trim() ?? '';
      const label = keyword === 'else' ? 'else' : `${keyword} ${body}`.trim();
      stack.push({
        kind: 'condition',
        indent,
        label,
      });
    }
  }

  return { sanitizedSource, contexts };
}

function buildPythonConstantMap(source: string, boardId: string) {
  const constants = new Map<string, string>();
  const sanitizedSource = stripPythonComments(source);
  const constantRegex = /^\s*([A-Za-z_]\w*)\s*=\s*([A-Za-z0-9_.'"-]+)\s*$/gm;

  for (const match of sanitizedSource.matchAll(constantRegex)) {
    const name = match[1];
    const value = match[2];
    if (!name || !value) {
      continue;
    }

    const normalized = constants.get(value) ?? normalizeBoardPin(boardId, value);
    if (normalized) {
      constants.set(name, normalized);
    }
  }

  return constants;
}

function resolvePythonPinToken(
  rawToken: string,
  boardId: string,
  constants: Map<string, string>,
  aliases: Map<string, string>
) {
  const cleaned = rawToken.trim();
  return aliases.get(cleaned) ?? constants.get(cleaned) ?? normalizeBoardPin(boardId, cleaned);
}

function buildGeneratedPythonAliasMap(source: string, boardId: string, constants: Map<string, string>) {
  const aliases = new Map<string, string>();
  const sanitizedSource = stripPythonComments(source);
  const constructorRegex =
    /^\s*([A-Za-z_]\w*)\s*=\s*(?:Pin|DigitalInOut|LED|PWMLED|Buzzer|OutputDevice|DigitalOutputDevice|Servo)\s*\(\s*([A-Za-z0-9_.'"-]+)\s*[\),]/gm;

  for (const match of sanitizedSource.matchAll(constructorRegex)) {
    const alias = match[1];
    const rawPin = match[2];
    if (!alias || !rawPin) {
      continue;
    }

    const resolvedPin = resolvePythonPinToken(rawPin, boardId, constants, aliases);
    if (resolvedPin) {
      aliases.set(alias, resolvedPin);
    }
  }

  return aliases;
}

function annotateOperation(
  operation: ParsedCppOperation,
  lineContext: PythonLineContext | undefined
): ParsedCppOperation {
  if (!lineContext) {
    return operation;
  }

  const conditions = lineContext.conditions.length > 0 ? lineContext.conditions : undefined;
  const callPath = lineContext.callPath.length > 0 ? lineContext.callPath : undefined;

  return {
    ...operation,
    scope: lineContext.scope,
    conditions,
    callPath,
    conditional: Boolean(conditions?.length),
  };
}

function collectGeneratedPythonOperations(
  source: string,
  boardId: string,
  aliases: Map<string, string>,
  constants: Map<string, string>,
  lineContexts: Map<number, PythonLineContext>
) {
  const sanitizedSource = stripPythonComments(source);
  const operations: ParsedCppOperation[] = [];
  const onOffRegex = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.(on|off|toggle|blink)\s*\(/g;
  const valueReadRegex = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.value\s*\(\s*\)/g;
  const valueWriteRegex = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.value\s*\(\s*([01]|True|False)\s*\)/g;
  const inlinePinObjectRegex = /Pin\s*\(\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\)\.(on|off|toggle|blink)\s*\(/g;

  for (const match of sanitizedSource.matchAll(onOffRegex)) {
    const boardPin = resolvePythonPinToken(match[1] ?? '', boardId, constants, aliases);
    if (!boardPin || match.index == null) {
      continue;
    }

    const op = match[2] ?? 'on';
    const line = getLineNumber(sanitizedSource, match.index);
    operations.push(
      annotateOperation({
        type: op === 'blink' || op === 'toggle' ? 'analogWrite' : 'digitalWrite',
        boardPin,
        value: op === 'off' ? 'LOW' : 'HIGH',
        line,
        scope: 'other',
      }, lineContexts.get(line))
    );
  }

  for (const match of sanitizedSource.matchAll(valueReadRegex)) {
    const boardPin = resolvePythonPinToken(match[1] ?? '', boardId, constants, aliases);
    if (!boardPin || match.index == null) {
      continue;
    }

    const line = getLineNumber(sanitizedSource, match.index);
    operations.push(
      annotateOperation({
        type: 'digitalRead',
        boardPin,
        line,
        scope: 'other',
      }, lineContexts.get(line))
    );
  }

  for (const match of sanitizedSource.matchAll(valueWriteRegex)) {
    const boardPin = resolvePythonPinToken(match[1] ?? '', boardId, constants, aliases);
    if (!boardPin || match.index == null) {
      continue;
    }

    const line = getLineNumber(sanitizedSource, match.index);
    operations.push(
      annotateOperation({
        type: 'digitalWrite',
        boardPin,
        value: /0|False/.test(match[2] ?? '') ? 'LOW' : 'HIGH',
        line,
        scope: 'other',
      }, lineContexts.get(line))
    );
  }

  for (const match of sanitizedSource.matchAll(inlinePinObjectRegex)) {
    const boardPin = resolvePythonPinToken(match[1] ?? '', boardId, constants, aliases);
    if (!boardPin || match.index == null) {
      continue;
    }

    const op = match[2] ?? 'on';
    const line = getLineNumber(sanitizedSource, match.index);
    operations.push(
      annotateOperation({
        type: op === 'blink' || op === 'toggle' ? 'analogWrite' : 'digitalWrite',
        boardPin,
        value: op === 'off' ? 'LOW' : 'HIGH',
        line,
        scope: 'other',
      }, lineContexts.get(line))
    );
  }

  return operations;
}

function parseGeneratedPython(source: string, boardId: string): PythonParseTree {
  const { sanitizedSource, contexts } = buildPythonLineContexts(source);
  const constants = buildPythonConstantMap(source, boardId);
  const aliases = buildGeneratedPythonAliasMap(source, boardId, constants);
  const calls = collectPythonCallCaptures(source).map(call => {
    const lineContext = contexts.get(call.line);
    if (!lineContext?.callPath.length) {
      return call;
    }

    return {
      ...call,
      raw: `${lineContext.callPath.join(' -> ')} :: ${call.raw}`,
    } satisfies PythonCallCapture;
  });
  const operations = collectGeneratedPythonOperations(source, boardId, aliases, constants, contexts);

  return {
    backend: 'generated',
    source,
    sanitizedSource,
    hasErrors: hasObviousPythonSyntaxError(sanitizedSource),
    calls,
    operations,
    aliases: Array.from(aliases.entries()).map(([name, boardPin]) => ({
      name,
      boardPin,
    })),
  };
}

const generatedPythonAstBindings: ModuMakePythonAstBindings = {
  parsePython: ({ source, boardId }) => parseGeneratedPython(source, boardId),
  collectPythonReviewArtifacts: ({ code, boardId }) => {
    const parseTree = parseGeneratedPython(code, boardId);
    return {
      language: 'python',
      operations: parseTree.operations,
      parseTree,
    } satisfies PythonReviewArtifacts;
  },
};

export async function loadGeneratedPythonTreeSitterBindings(): Promise<ModuMakePythonAstBindings | null> {
  const vendoredBindings = await loadVendoredPythonTreeSitterBindings();
  if (vendoredBindings) {
    return vendoredBindings;
  }

  return generatedPythonAstBindings;
}
