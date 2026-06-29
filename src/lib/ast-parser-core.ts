import { getBoardById } from '@/constants/boards';

export type CodeScope = 'setup' | 'loop' | 'other';

export type CppArgumentKind = 'identifier' | 'number' | 'string' | 'expression';

export type ParsedCppOperation =
  | {
      type: 'pinMode';
      boardPin: string;
      mode: string;
      line: number;
      scope: CodeScope;
      conditions?: string[];
      callPath?: string[];
      conditional?: boolean;
    }
  | {
      type: 'digitalWrite' | 'analogWrite' | 'digitalRead' | 'analogRead';
      boardPin: string;
      value?: string;
      line: number;
      scope: CodeScope;
      conditions?: string[];
      callPath?: string[];
      conditional?: boolean;
    };

export interface CppCallCapture {
  name: string;
  subject?: string;
  arguments: Array<{
    raw: string;
    kind: CppArgumentKind;
    value: string;
  }>;
  line: number;
  raw: string;
}

export interface CppParseTree {
  backend: 'fallback' | 'rust-wasm';
  source: string;
  preprocessedSource: string;
  sanitizedSource: string;
  hasErrors: boolean;
  calls: CppCallCapture[];
}

export type PythonCallCapture = CppCallCapture;

type CppFunctionRange = {
  name: string;
  start: number;
  end: number;
};

type CppAstCallNode = {
  kind: 'call';
  name: string;
  args: string[];
  line: number;
  index: number;
};

type CppAstBranchNode = {
  kind: 'branch';
  branchKind: 'if' | 'else' | 'while' | 'for';
  condition: string;
  consequent: CppAstNode[];
  alternate?: CppAstNode[];
  line: number;
  index: number;
};

type CppAstNode = CppAstCallNode | CppAstBranchNode;

type ParsedCppFunctionDefinition = {
  name: string;
  params: string[];
  range: CppFunctionRange;
  nodes: CppAstNode[];
};

function blankNonNewlineCharacters(segment: string) {
  return segment.replace(/[^\n\r]/g, ' ');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripCppComments(code: string) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, match => blankNonNewlineCharacters(match))
    .replace(/\/\/[^\n\r]*/g, match => blankNonNewlineCharacters(match));
}

export function getLineNumber(source: string, index: number) {
  return source.slice(0, index).split('\n').length;
}

export function normalizeBoardPin(boardId: string, token: string) {
  const board = getBoardById(boardId);
  const cleaned = token.trim().replace(/['"]/g, '');
  if (!cleaned) {
    return null;
  }

  const dottedTail = cleaned.includes('.') ? cleaned.split('.').at(-1) ?? cleaned : cleaned;

  const candidates = new Set<string>([
    cleaned,
    cleaned.toUpperCase(),
    dottedTail,
    dottedTail.toUpperCase(),
    cleaned.replace(/^GPIO/i, 'GPIO'),
    cleaned.replace(/^G/i, 'G'),
    dottedTail.replace(/^GPIO/i, 'GPIO'),
    dottedTail.replace(/^G/i, 'G'),
  ]);

  for (const numericToken of [cleaned, dottedTail]) {
    if (/^\d+$/.test(numericToken)) {
      candidates.add(`D${numericToken}`);
      candidates.add(`GPIO${numericToken}`);
      candidates.add(`G${numericToken}`);
      candidates.add(`A${numericToken}`);
    }
  }

  for (const candidate of candidates) {
    if (board.pinDefinitions.some(pin => pin.id === candidate)) {
      return candidate;
    }
  }

  return null;
}

export function preprocessCppSource(source: string) {
  const sanitizedSource = stripCppComments(source);
  const macros = new Map<string, string>();

  for (const line of sanitizedSource.split(/\r?\n/)) {
    const defineMatch = line.match(/^\s*#define\s+([A-Za-z_]\w*)\s+(.+?)\s*$/);
    if (!defineMatch) {
      continue;
    }

    const [, name, value] = defineMatch;
    if (!name || !value || /\(/.test(name)) {
      continue;
    }

    macros.set(name, value.trim());
  }

  let preprocessed = sanitizedSource;
  for (const [name, value] of macros.entries()) {
    const tokenRegex = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g');
    preprocessed = preprocessed
      .split(/\r?\n/)
      .map(line => (/^\s*#/.test(line) ? line : line.replace(tokenRegex, value)))
      .join('\n');
  }

  return {
    sanitizedSource,
    preprocessedSource: preprocessed,
    macros,
  };
}

function hasObviousSyntaxError(source: string) {
  const pairs: Record<string, string> = {
    '(': ')',
    '{': '}',
    '[': ']',
  };
  const closing = new Set(Object.values(pairs));
  const stack: string[] = [];
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];

    if (char === "'" && previous !== '\\' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && previous !== '\\' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char in pairs) {
      stack.push(char);
      continue;
    }

    if (closing.has(char)) {
      const opener = stack.pop();
      if (!opener || pairs[opener] !== char) {
        return true;
      }
    }
  }

  return inSingleQuote || inDoubleQuote || stack.length > 0;
}

export function buildCppAliasMap(code: string, boardId: string) {
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

export function resolvePinReference(rawReference: string, boardId: string, aliases: Map<string, string>) {
  const cleaned = rawReference.trim();
  return aliases.get(cleaned) ?? normalizeBoardPin(boardId, cleaned);
}

export function stripPythonComments(code: string) {
  return code.replace(/#[^\n\r]*/g, match => blankNonNewlineCharacters(match));
}

export function hasObviousPythonSyntaxError(source: string) {
  const pairs: Record<string, string> = {
    '(': ')',
    '{': '}',
    '[': ']',
  };
  const closing = new Set(Object.values(pairs));
  const stack: string[] = [];
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];

    if (char === "'" && previous !== '\\' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && previous !== '\\' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char in pairs) {
      stack.push(char);
      continue;
    }

    if (closing.has(char)) {
      const opener = stack.pop();
      if (!opener || pairs[opener] !== char) {
        return true;
      }
    }
  }

  return inSingleQuote || inDoubleQuote || stack.length > 0;
}

export function buildPythonAliasMap(code: string, boardId: string) {
  const sanitizedCode = stripPythonComments(code);
  const aliases = new Map<string, string>();
  const pinValueRegex =
    /^\s*([A-Za-z_]\w*)\s*=\s*(?:Pin|DigitalInOut)\s*\(\s*([A-Za-z0-9_.'"-]+)\s*[\),]/gm;
  const deviceRegex =
    /^\s*([A-Za-z_]\w*)\s*=\s*(?:LED|PWMLED|Buzzer|OutputDevice|DigitalOutputDevice|Servo)\s*\(\s*([A-Za-z0-9_.'"-]+)\s*[\),]/gm;

  for (const regex of [pinValueRegex, deviceRegex]) {
    for (const match of sanitizedCode.matchAll(regex)) {
      const alias = match[1];
      const resolvedPin = normalizeBoardPin(boardId, match[2] ?? '');
      if (alias && resolvedPin) {
        aliases.set(alias, resolvedPin);
      }
    }
  }

  return aliases;
}

export function collectPythonCallCaptures(code: string): PythonCallCapture[] {
  const sanitizedCode = stripPythonComments(code);
  const captures: PythonCallCapture[] = [];

  for (const [lineIndex, line] of sanitizedCode.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('def ') || trimmed.startsWith('class ')) {
      continue;
    }

    const openIndex = trimmed.indexOf('(');
    const closeIndex = trimmed.lastIndexOf(')');
    if (openIndex < 0 || closeIndex <= openIndex) {
      continue;
    }

    const callee = trimmed.slice(0, openIndex).trim();
    if (!callee || /[\s=]/.test(callee)) {
      continue;
    }

    const rawArgs = trimmed.slice(openIndex + 1, closeIndex);
    const args = rawArgs.trim()
      ? rawArgs.split(',').map(argument => argument.trim()).filter(Boolean)
      : [];

    const [subject, name] = callee.includes('.')
      ? [callee.slice(0, callee.lastIndexOf('.')), callee.slice(callee.lastIndexOf('.') + 1)]
      : [undefined, callee];

    captures.push({
      name,
      subject,
      arguments: args.map(argument => ({
        raw: argument,
        kind:
          argument.startsWith('"') || argument.startsWith("'")
            ? 'string'
            : /^-?\d+(\.\d+)?$/.test(argument)
              ? 'number'
              : /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(argument)
                ? 'identifier'
                : 'expression',
        value: argument,
      })),
      line: lineIndex + 1,
      raw: trimmed,
    });
  }

  return captures;
}

export function collectPythonOperations(code: string, boardId: string): ParsedCppOperation[] {
  const sanitizedCode = stripPythonComments(code);
  const aliases = buildPythonAliasMap(sanitizedCode, boardId);
  const operations: ParsedCppOperation[] = [];
  const onOffRegex = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.(on|off|toggle|blink)\s*\(/g;
  const valueReadRegex = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.value\s*\(\s*\)/g;
  const valueWriteRegex = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.value\s*\(\s*([01]|True|False)\s*\)/g;
  const inlinePinObjectRegex = /Pin\s*\(\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\)\.(on|off|toggle|blink)\s*\(/g;

  for (const match of sanitizedCode.matchAll(onOffRegex)) {
    const boardPin = resolvePinReference(match[1] ?? '', boardId, aliases);
    if (!boardPin || match.index == null) {
      continue;
    }

    const op = match[2] ?? 'on';
    operations.push({
      type: op === 'blink' || op === 'toggle' ? 'analogWrite' : 'digitalWrite',
      boardPin,
      value: op === 'off' ? 'LOW' : 'HIGH',
      line: getLineNumber(sanitizedCode, match.index),
      scope: 'other',
    });
  }

  for (const match of sanitizedCode.matchAll(valueReadRegex)) {
    const boardPin = resolvePinReference(match[1] ?? '', boardId, aliases);
    if (!boardPin || match.index == null) {
      continue;
    }

    operations.push({
      type: 'digitalRead',
      boardPin,
      line: getLineNumber(sanitizedCode, match.index),
      scope: 'other',
    });
  }

  for (const match of sanitizedCode.matchAll(valueWriteRegex)) {
    const boardPin = resolvePinReference(match[1] ?? '', boardId, aliases);
    if (!boardPin || match.index == null) {
      continue;
    }

    operations.push({
      type: 'digitalWrite',
      boardPin,
      value: /0|False/.test(match[2] ?? '') ? 'LOW' : 'HIGH',
      line: getLineNumber(sanitizedCode, match.index),
      scope: 'other',
    });
  }

  for (const match of sanitizedCode.matchAll(inlinePinObjectRegex)) {
    const boardPin = resolvePinReference(match[1] ?? '', boardId, aliases);
    if (!boardPin || match.index == null) {
      continue;
    }

    const op = match[2] ?? 'on';
    operations.push({
      type: op === 'blink' || op === 'toggle' ? 'analogWrite' : 'digitalWrite',
      boardPin,
      value: op === 'off' ? 'LOW' : 'HIGH',
      line: getLineNumber(sanitizedCode, match.index),
      scope: 'other',
    });
  }

  return operations;
}

function parseCppParams(rawParams: string) {
  if (!rawParams.trim()) {
    return [];
  }

  return rawParams
    .split(',')
    .map(param => param.trim())
    .map(param => param.replace(/=[\s\S]*$/, '').trim())
    .map(param => {
      const nameMatch = param.match(/([A-Za-z_]\w*)$/);
      return nameMatch?.[1] ?? '';
    })
    .filter(Boolean);
}

function parseCppCallArguments(rawArgs: string) {
  if (!rawArgs.trim()) {
    return [];
  }

  const args: string[] = [];
  let current = '';
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const char = rawArgs[index];
    const previous = rawArgs[index - 1];

    if (char === "'" && previous !== '\\' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (char === '"' && previous !== '\\' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '(' || char === '[' || char === '{') {
        depth += 1;
      } else if (char === ')' || char === ']' || char === '}') {
        depth = Math.max(depth - 1, 0);
      } else if (char === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

function isIdentifierStart(char: string | undefined) {
  return Boolean(char && /[A-Za-z_]/.test(char));
}

function isIdentifierPart(char: string | undefined) {
  return Boolean(char && /[A-Za-z0-9_]/.test(char));
}

function isWordBoundary(source: string, start: number, token: string) {
  const before = source[start - 1];
  const after = source[start + token.length];
  return !isIdentifierPart(before) && !isIdentifierPart(after);
}

function skipWhitespace(source: string, index: number) {
  let cursor = index;
  while (cursor < source.length && /\s/.test(source[cursor] ?? '')) {
    cursor += 1;
  }
  return cursor;
}

function findMatchingDelimiter(source: string, startIndex: number, open: string, close: string) {
  if (source[startIndex] !== open) {
    return -1;
  }

  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];

    if (char === "'" && previous !== '\\' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && previous !== '\\' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function readIdentifier(source: string, startIndex: number) {
  if (!isIdentifierStart(source[startIndex])) {
    return null;
  }

  let end = startIndex + 1;
  while (end < source.length && isIdentifierPart(source[end])) {
    end += 1;
  }

  return {
    value: source.slice(startIndex, end),
    end,
  };
}

function parseCallStatement(source: string, startIndex: number): { node: CppAstCallNode; end: number } | null {
  const identifier = readIdentifier(source, startIndex);
  if (!identifier) {
    return null;
  }

  const openParenIndex = skipWhitespace(source, identifier.end);
  if (source[openParenIndex] !== '(') {
    return null;
  }

  const closeParenIndex = findMatchingDelimiter(source, openParenIndex, '(', ')');
  if (closeParenIndex < 0) {
    return null;
  }

  const statementEnd = skipWhitespace(source, closeParenIndex + 1);
  if (source[statementEnd] !== ';') {
    return null;
  }

  return {
    node: {
      kind: 'call',
      name: identifier.value,
      args: parseCppCallArguments(source.slice(openParenIndex + 1, closeParenIndex)),
      line: getLineNumber(source, startIndex),
      index: startIndex,
    },
    end: statementEnd + 1,
  };
}

function parseBlockOrStatementNodes(source: string, startIndex: number): { nodes: CppAstNode[]; end: number } {
  const cursor = skipWhitespace(source, startIndex);
  if (source[cursor] === '{') {
    const closeBraceIndex = findMatchingDelimiter(source, cursor, '{', '}');
    if (closeBraceIndex < 0) {
      return { nodes: [], end: source.length };
    }

    return {
      nodes: parseAstNodes(source, cursor + 1, closeBraceIndex),
      end: closeBraceIndex + 1,
    };
  }

  const statementEnd = source.indexOf(';', cursor);
  if (statementEnd < 0) {
    return {
      nodes: parseAstNodes(source, cursor, source.length),
      end: source.length,
    };
  }

  return {
    nodes: parseAstNodes(source, cursor, statementEnd + 1),
    end: statementEnd + 1,
  };
}

function parseBranchNode(
  source: string,
  startIndex: number,
  branchKind: 'if' | 'while' | 'for'
): { node: CppAstBranchNode; end: number } | null {
  if (!isWordBoundary(source, startIndex, branchKind)) {
    return null;
  }

  const openParenIndex = skipWhitespace(source, startIndex + branchKind.length);
  if (source[openParenIndex] !== '(') {
    return null;
  }

  const closeParenIndex = findMatchingDelimiter(source, openParenIndex, '(', ')');
  if (closeParenIndex < 0) {
    return null;
  }

  const condition = source.slice(openParenIndex + 1, closeParenIndex).trim();
  const consequent = parseBlockOrStatementNodes(source, closeParenIndex + 1);
  let alternate: CppAstNode[] | undefined;
  let end = consequent.end;

  if (branchKind === 'if') {
    const afterConsequent = skipWhitespace(source, consequent.end);
    if (source.startsWith('else', afterConsequent) && isWordBoundary(source, afterConsequent, 'else')) {
      const elseBody = parseBlockOrStatementNodes(source, afterConsequent + 4);
      alternate = elseBody.nodes;
      end = elseBody.end;
    }
  }

  return {
    node: {
      kind: 'branch',
      branchKind,
      condition,
      consequent: consequent.nodes,
      alternate,
      line: getLineNumber(source, startIndex),
      index: startIndex,
    },
    end,
  };
}

function parseAstNodes(source: string, startIndex: number, endIndex: number): CppAstNode[] {
  const nodes: CppAstNode[] = [];
  let cursor = startIndex;

  while (cursor < endIndex) {
    cursor = skipWhitespace(source, cursor);
    if (cursor >= endIndex) {
      break;
    }

    if (source.startsWith('if', cursor)) {
      const branch = parseBranchNode(source, cursor, 'if');
      if (branch) {
        nodes.push(branch.node);
        cursor = branch.end;
        continue;
      }
    }

    if (source.startsWith('while', cursor)) {
      const branch = parseBranchNode(source, cursor, 'while');
      if (branch) {
        nodes.push(branch.node);
        cursor = branch.end;
        continue;
      }
    }

    if (source.startsWith('for', cursor)) {
      const branch = parseBranchNode(source, cursor, 'for');
      if (branch) {
        nodes.push(branch.node);
        cursor = branch.end;
        continue;
      }
    }

    const call = parseCallStatement(source, cursor);
    if (call) {
      nodes.push(call.node);
      cursor = call.end;
      continue;
    }

    cursor += 1;
  }

  return nodes;
}

function collectFunctionDefinitions(code: string) {
  const definitions: ParsedCppFunctionDefinition[] = [];
  const definitionRegex = /(?:^|\n)\s*(?:[A-Za-z_][\w:<>\s*&]+?)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/g;

  for (const match of code.matchAll(definitionRegex)) {
    const name = match[1];
    const rawParams = match[2] ?? '';
    const matchIndex = match.index ?? 0;
    const openBraceIndex = matchIndex + match[0].lastIndexOf('{');
    const closeBraceIndex = findMatchingDelimiter(code, openBraceIndex, '{', '}');

    if (!name || closeBraceIndex < 0) {
      continue;
    }

    definitions.push({
      name,
      params: parseCppParams(rawParams),
      range: {
        name,
        start: matchIndex,
        end: closeBraceIndex + 1,
      },
      nodes: parseAstNodes(code, openBraceIndex + 1, closeBraceIndex),
    });
  }

  return definitions;
}

function substituteToken(rawValue: string, bindings: Map<string, string>) {
  let current = rawValue.trim();
  const visited = new Set<string>();

  while (bindings.has(current) && !visited.has(current)) {
    visited.add(current);
    current = (bindings.get(current) ?? current).trim();
  }

  return current;
}

function substituteExpression(rawValue: string, bindings: Map<string, string>) {
  let result = rawValue;
  for (const [key, value] of bindings.entries()) {
    const regex = new RegExp(`\\b${escapeRegExp(key)}\\b`, 'g');
    result = result.replace(regex, value);
  }
  return result.trim();
}

function makeScopeFromFunction(functionName: string): CodeScope {
  if (functionName === 'setup') {
    return 'setup';
  }

  if (functionName === 'loop') {
    return 'loop';
  }

  return 'other';
}

function buildOperationsFromAst(
  definitions: ParsedCppFunctionDefinition[],
  boardId: string,
  aliases: Map<string, string>
) {
  const definitionMap = new Map(definitions.map(definition => [definition.name, definition]));
  const operations: ParsedCppOperation[] = [];
  const maxDepth = 8;

  const visitNodes = (
    nodes: CppAstNode[],
    functionName: string,
    bindings: Map<string, string>,
    conditions: string[],
    callPath: string[],
    depth: number
  ) => {
    if (depth > maxDepth) {
      return;
    }

    for (const node of nodes) {
      if (node.kind === 'branch') {
        const branchCondition = substituteExpression(node.condition, bindings);
        visitNodes(
          node.consequent,
          functionName,
          new Map(bindings),
          [...conditions, `${node.branchKind}(${branchCondition})`],
          callPath,
          depth + 1
        );

        if (node.alternate && node.alternate.length > 0) {
          visitNodes(
            node.alternate,
            functionName,
            new Map(bindings),
            [...conditions, `else(${branchCondition})`],
            callPath,
            depth + 1
          );
        }
        continue;
      }

      if (!['pinMode', 'digitalWrite', 'analogWrite', 'digitalRead', 'analogRead'].includes(node.name)) {
        const callee = definitionMap.get(node.name);
        if (!callee || callPath.includes(`${callee.name}@${node.line}`)) {
          continue;
        }

        const nextBindings = new Map<string, string>();
        callee.params.forEach((param, index) => {
          nextBindings.set(param, substituteExpression(node.args[index] ?? '', bindings));
        });

        visitNodes(
          callee.nodes,
          callee.name,
          nextBindings,
          conditions,
          [...callPath, `${callee.name}@${node.line}`],
          depth + 1
        );
        continue;
      }

      const rawPin = substituteToken(node.args[0] ?? '', bindings);
      const boardPin = resolvePinReference(rawPin, boardId, aliases);
      if (!boardPin) {
        continue;
      }

      const baseOperation = {
        boardPin,
        line: node.line,
        scope: makeScopeFromFunction(functionName),
        conditions: conditions.length > 0 ? conditions : undefined,
        callPath: callPath.length > 0 ? callPath : undefined,
        conditional: conditions.length > 0,
      };

      if (node.name === 'pinMode') {
        operations.push({
          type: 'pinMode',
          ...baseOperation,
          mode: substituteExpression(node.args[1] ?? 'INPUT', bindings),
        });
        continue;
      }

      operations.push({
        type: node.name,
        ...baseOperation,
        value: substituteExpression(node.args[1] ?? '', bindings) || undefined,
      } as ParsedCppOperation);
    }
  };

  const rootFunctions = definitions.filter(definition => definition.name === 'setup' || definition.name === 'loop');
  if (rootFunctions.length === 0) {
    const genericRoots = definitions.filter(definition => definition.name === 'other');
    for (const root of genericRoots) {
      visitNodes(root.nodes, 'other', new Map(), [], ['other'], 0);
    }
    return operations;
  }

  for (const root of rootFunctions) {
    visitNodes(root.nodes, root.name, new Map(), [], [root.name], 0);
  }

  return operations;
}

function collectCallCaptures(code: string): CppCallCapture[] {
  const callRegex = /\b([A-Za-z_]\w*)\s*\(([^()]*)\)/g;
  const captures: CppCallCapture[] = [];

  for (const match of code.matchAll(callRegex)) {
    if (!match[1] || match.index == null) {
      continue;
    }

    const identifierStart = match.index;
    let subject: string | undefined;
    let cursor = identifierStart - 1;
    while (cursor >= 0 && /\s/.test(code[cursor] ?? '')) {
      cursor -= 1;
    }

    if (code[cursor] === '.') {
      const subjectEnd = cursor;
      cursor -= 1;
      while (cursor >= 0 && /[A-Za-z0-9_.]/.test(code[cursor] ?? '')) {
        cursor -= 1;
      }
      subject = code.slice(cursor + 1, subjectEnd).trim() || undefined;
    }

    captures.push({
      name: match[1],
      subject,
      arguments: parseCppCallArguments(match[2] ?? '').map(argument => {
        const trimmed = argument.trim();
        const kind: CppArgumentKind =
          /^['"]/.test(trimmed) ? 'string' :
          /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed) ? 'number' :
          /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(trimmed) ? 'identifier' :
          'expression';

        return {
          raw: argument,
          kind,
          value: trimmed,
        };
      }),
      line: getLineNumber(code, match.index),
      raw: match[0],
    });
  }

  return captures;
}

export async function parseCpp(source: string): Promise<CppParseTree | null> {
  const { sanitizedSource, preprocessedSource } = preprocessCppSource(source);

  if (hasObviousSyntaxError(preprocessedSource)) {
    return null;
  }

  return {
    backend: 'fallback',
    source,
    preprocessedSource,
    sanitizedSource,
    hasErrors: false,
    calls: collectCallCaptures(preprocessedSource),
  };
}

export function findCalls(tree: CppParseTree | null, name: string) {
  if (!tree) {
    return [];
  }

  return tree.calls.filter(capture => capture.name === name);
}

export function collectCppOperations(code: string, boardId: string) {
  const { preprocessedSource } = preprocessCppSource(code);
  const sanitizedCode = preprocessedSource;
  const aliases = buildCppAliasMap(sanitizedCode, boardId);
  const definitions = collectFunctionDefinitions(sanitizedCode);
  const operations = buildOperationsFromAst(definitions, boardId, aliases);

  if (operations.length > 0) {
    return operations.sort((left, right) => left.line - right.line);
  }

  const fallbackCalls = parseAstNodes(sanitizedCode, 0, sanitizedCode.length);
  const syntheticRoot: ParsedCppFunctionDefinition = {
    name: 'other',
    params: [],
    range: {
      name: 'other',
      start: 0,
      end: sanitizedCode.length,
    },
    nodes: fallbackCalls,
  };

  return buildOperationsFromAst([syntheticRoot], boardId, aliases).sort((left, right) => left.line - right.line);
}
