import {
  callModuMakeKernelJsonMethod,
  getModuMakeWasmKernelBindings,
  ensureGeneratedModuMakeWasmKernelBindings,
} from '@/lib/modumake-wasm-kernel';
import {
  ensureGeneratedModuMakePythonAstBindings,
  getModuMakePythonAstBindings,
} from '@/lib/python-ast-provider';
import {
  buildCppAliasMap,
  buildPythonAliasMap,
  collectPythonCallCaptures,
  findCalls,
  getLineNumber,
  hasObviousPythonSyntaxError,
  normalizeBoardPin,
  parseCpp as parseCppFallback,
  preprocessCppSource,
  collectPythonOperations as collectPythonOperationsFallback,
  resolvePinReference,
  stripCppComments,
  stripPythonComments,
  collectCppOperations as collectCppOperationsFallback,
} from '@/lib/ast-parser-core';

import type {
  CodeScope,
  CppArgumentKind,
  CppCallCapture,
  CppParseTree,
  ParsedCppOperation,
} from '@/lib/ast-parser-core';

export type { CodeScope, CppArgumentKind, CppCallCapture, CppParseTree, ParsedCppOperation };
export {
  buildCppAliasMap,
  buildPythonAliasMap,
  findCalls,
  getLineNumber,
  normalizeBoardPin,
  preprocessCppSource,
  resolvePinReference,
  stripCppComments,
  stripPythonComments,
};

export interface ParsedCppI2cAddressUse {
  address: string;
  line: number;
  source: string;
  templateHint?: string;
}

export interface ParsedCppInterruptUse {
  boardPin: string;
  line: number;
}

export interface CppReviewArtifacts {
  language: 'cpp';
  operations: ParsedCppOperation[];
  i2cAddressUses: ParsedCppI2cAddressUse[];
  interruptUses: ParsedCppInterruptUse[];
  includedHeaders: string[];
  parseTree: CppParseTree | null;
}

export interface PythonParseTree {
  backend: 'fallback' | 'rust-wasm' | 'tree-sitter' | 'generated';
  source: string;
  sanitizedSource: string;
  hasErrors: boolean;
  calls: CppCallCapture[];
  operations: ParsedCppOperation[];
  aliases: Array<{
    name: string;
    boardPin: string;
  }>;
}

export interface PythonReviewArtifacts {
  language: 'python';
  operations: ParsedCppOperation[];
  parseTree: PythonParseTree;
}

type RawPythonReviewArtifacts = {
  language?: 'python';
  operations?: ParsedCppOperation[];
  parseTree?: PythonParseTree | null;
};

type RawCppReviewArtifacts = {
  language?: 'cpp';
  operations?: ParsedCppOperation[];
  i2cAddressUses?: ParsedCppI2cAddressUse[];
  interruptUses?: ParsedCppInterruptUse[];
  includedHeaders?: string[];
  parseTree?: CppParseTree | null;
};

function normalizeTreeBackend(tree: CppParseTree | null) {
  if (!tree) {
    return null;
  }

  return {
    ...tree,
    backend: tree.backend ?? 'fallback',
  } as CppParseTree;
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function cppOperationKey(operation: ParsedCppOperation) {
  return [
    operation.type,
    operation.boardPin,
    'mode' in operation ? operation.mode : '',
    'value' in operation ? operation.value ?? '' : '',
    operation.line,
    operation.scope,
    operation.conditions?.join('&') ?? '',
    operation.callPath?.join('>') ?? '',
  ].join('|');
}

function collectFallbackCppReviewArtifacts(code: string, boardId: string): CppReviewArtifacts {
  return {
    language: 'cpp',
    operations: collectCppOperationsFallback(code, boardId),
    i2cAddressUses: collectI2cAddressUsesInternal(code),
    interruptUses: collectInterruptUsesInternal(code, boardId),
    includedHeaders: collectIncludedHeadersInternal(code),
    parseTree: null,
  };
}

function mergeCppReviewArtifacts(
  primary: CppReviewArtifacts,
  fallback: CppReviewArtifacts
): CppReviewArtifacts {
  return {
    language: 'cpp',
    operations: uniqueBy([...primary.operations, ...fallback.operations], cppOperationKey),
    i2cAddressUses: uniqueBy(
      [...primary.i2cAddressUses, ...fallback.i2cAddressUses],
      item => `${item.address}|${item.line}|${item.source}|${item.templateHint ?? ''}`
    ),
    interruptUses: uniqueBy(
      [...primary.interruptUses, ...fallback.interruptUses],
      item => `${item.boardPin}|${item.line}`
    ),
    includedHeaders: Array.from(new Set([...primary.includedHeaders, ...fallback.includedHeaders])),
    parseTree: primary.parseTree ?? fallback.parseTree,
  };
}

export async function parseCpp(source: string): Promise<CppParseTree | null> {
  await ensureGeneratedModuMakeWasmKernelBindings();
  const bindings = getModuMakeWasmKernelBindings();
  const wasmParser = bindings?.parseCppJson;

  if (wasmParser) {
    try {
      return normalizeTreeBackend(JSON.parse(wasmParser(source)) as CppParseTree | null);
    } catch {
      return parseCppFallback(source);
    }
  }

  return parseCppFallback(source);
}

export function looksLikeCppCode(code: string) {
  const sanitizedCppCode = stripCppComments(code);
  return (
    sanitizedCppCode.includes('void setup(') ||
    sanitizedCppCode.includes('#include') ||
    /\b(pinMode|digitalWrite|analogWrite|digitalRead|analogRead)\s*\(/.test(sanitizedCppCode)
  );
}

export function collectCppOperations(code: string, boardId: string) {
  return callModuMakeKernelJsonMethod(
    'collectCppOperationsJson',
    { code, boardId },
    collectCppOperationsFallback(code, boardId)
  );
}

export async function collectCppOperationsAsync(code: string, boardId: string) {
  await ensureGeneratedModuMakeWasmKernelBindings();
  return collectCppOperations(code, boardId);
}

export function collectPythonOperations(code: string, boardId: string) {
  return callModuMakeKernelJsonMethod(
    'collectPythonOperationsJson',
    { code, boardId },
    collectPythonOperationsFallback(code, boardId)
  );
}

export function parsePython(source: string, boardId: string): PythonParseTree {
  const wasmResult = callModuMakeKernelJsonMethod<PythonReviewArtifacts | { source: string; boardId: string }, PythonParseTree | null>(
    'parsePythonJson',
    { source, boardId },
    null
  );

  if (wasmResult) {
    return {
      ...wasmResult,
      backend: wasmResult.backend ?? 'rust-wasm',
      hasErrors: wasmResult.hasErrors ?? false,
      calls: wasmResult.calls ?? [],
      operations: wasmResult.operations ?? [],
      aliases: wasmResult.aliases ?? [],
    };
  }

  const sanitizedSource = stripPythonComments(source);
  const aliases = Array.from(buildPythonAliasMap(source, boardId).entries()).map(([name, boardPin]) => ({
    name,
    boardPin,
  }));
  const calls = collectPythonCallCaptures(source);
  const operations = collectPythonOperationsFallback(source, boardId);

  return {
    backend: 'fallback',
    source,
    sanitizedSource,
    hasErrors: hasObviousPythonSyntaxError(sanitizedSource),
    calls,
    operations,
    aliases,
  };
}

export async function parsePythonAsync(source: string, boardId: string) {
  await ensureGeneratedModuMakePythonAstBindings();
  const provider = getModuMakePythonAstBindings();

  if (provider?.parsePython) {
    try {
      const result = provider.parsePython({ source, boardId }) as PythonParseTree | null;
      if (result) {
        return {
          ...result,
          backend: result.backend ?? 'generated',
          hasErrors: result.hasErrors ?? false,
          calls: result.calls ?? [],
          operations: result.operations ?? [],
          aliases: result.aliases ?? [],
        } satisfies PythonParseTree;
      }
    } catch {
      // Fall through to the Rust/TypeScript parser path.
    }
  }

  await ensureGeneratedModuMakeWasmKernelBindings();
  return parsePython(source, boardId);
}

export function collectPythonReviewArtifacts(code: string, boardId: string): PythonReviewArtifacts {
  const wasmResult = callModuMakeKernelJsonMethod(
    'collectPythonReviewArtifactsJson',
    { code, boardId },
    null as PythonReviewArtifacts | null
  );
  if (wasmResult?.parseTree) {
    return {
      language: 'python',
      operations: wasmResult.operations ?? [],
      parseTree: {
        ...wasmResult.parseTree,
        backend: wasmResult.parseTree.backend ?? 'rust-wasm',
        hasErrors: wasmResult.parseTree.hasErrors ?? false,
        calls: wasmResult.parseTree.calls ?? [],
        operations: wasmResult.parseTree.operations ?? wasmResult.operations ?? [],
        aliases: wasmResult.parseTree.aliases ?? [],
      },
    };
  }

  const parseTree = parsePython(code, boardId);

  return {
    language: 'python',
    operations: parseTree.operations,
    parseTree,
  };
}

export async function collectPythonReviewArtifactsAsync(code: string, boardId: string) {
  await ensureGeneratedModuMakePythonAstBindings();
  const provider = getModuMakePythonAstBindings();

  if (provider?.collectPythonReviewArtifacts) {
    try {
      const result = provider.collectPythonReviewArtifacts({
        code,
        boardId,
      }) as RawPythonReviewArtifacts | null;
      if (result?.parseTree) {
        return {
          language: 'python',
          operations: result.operations ?? [],
          parseTree: {
            ...result.parseTree,
            backend: result.parseTree.backend ?? 'generated',
            hasErrors: result.parseTree.hasErrors ?? false,
            calls: result.parseTree.calls ?? [],
            operations: result.parseTree.operations ?? result.operations ?? [],
            aliases: result.parseTree.aliases ?? [],
          },
        } satisfies PythonReviewArtifacts;
      }
    } catch {
      // Fall through to the Rust/TypeScript parser path.
    }
  }

  await ensureGeneratedModuMakeWasmKernelBindings();
  return collectPythonReviewArtifacts(code, boardId);
}

function normalizeI2cAddressToken(raw: string) {
  const token = raw.trim();
  const parsed = token.toLowerCase().startsWith('0x')
    ? Number.parseInt(token, 16)
    : Number.parseInt(token, 10);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return `0x${parsed.toString(16).toUpperCase()}`;
}

function collectIncludedHeadersInternal(code: string) {
  const sanitizedCode = stripCppComments(code);
  const headers = new Set<string>();
  const includeRegex = /^\s*#include\s*<([^>]+)>/gm;

  for (const match of sanitizedCode.matchAll(includeRegex)) {
    if (match[1]) {
      headers.add(match[1].trim());
    }
  }

  return Array.from(headers.values());
}

function collectI2cAddressUsesInternal(code: string): ParsedCppI2cAddressUse[] {
  const sanitizedCode = stripCppComments(code);
  const uses: ParsedCppI2cAddressUse[] = [];
  const patterns: Array<{ regex: RegExp; source: string; templateHint?: string }> = [
    {
      regex: /Wire\.beginTransmission\s*\(\s*(0x[0-9A-Fa-f]+|\d+)\s*\)/g,
      source: 'Wire.beginTransmission',
    },
    {
      regex: /LiquidCrystal_I2C\s+\w+\s*\(\s*(0x[0-9A-Fa-f]+|\d+)/g,
      source: 'LiquidCrystal_I2C',
      templateHint: 'tpl_lcd1602',
    },
    {
      regex: /\.begin\s*\(\s*[^,()]+,\s*(0x[0-9A-Fa-f]+|\d+)\s*\)/g,
      source: 'display.begin',
      templateHint: 'tpl_oled',
    },
  ];

  for (const pattern of patterns) {
    for (const match of sanitizedCode.matchAll(pattern.regex)) {
      if (match.index == null) {
        continue;
      }

      const address = normalizeI2cAddressToken(match[1] ?? '');
      if (!address) {
        continue;
      }

      uses.push({
        address,
        line: getLineNumber(sanitizedCode, match.index),
        source: pattern.source,
        templateHint: pattern.templateHint,
      });
    }
  }

  return uses;
}

function collectInterruptUsesInternal(code: string, boardId: string): ParsedCppInterruptUse[] {
  const sanitizedCode = stripCppComments(code);
  const aliases = buildCppAliasMap(sanitizedCode, boardId);
  const uses: ParsedCppInterruptUse[] = [];
  const interruptRegex = /attachInterrupt\s*\(\s*(?:digitalPinToInterrupt\s*\(\s*([A-Za-z0-9_]+)\s*\)|([A-Za-z0-9_]+))\s*,/g;

  for (const match of sanitizedCode.matchAll(interruptRegex)) {
    if (match.index == null) {
      continue;
    }

    const rawPin = match[1] ?? match[2] ?? '';
    const boardPin = resolvePinReference(rawPin, boardId, aliases);
    if (!boardPin) {
      continue;
    }

    uses.push({
      boardPin,
      line: getLineNumber(sanitizedCode, match.index),
    });
  }

  return uses;
}

export function collectCppReviewArtifacts(code: string, boardId: string): CppReviewArtifacts {
  const bindings = getModuMakeWasmKernelBindings();
  const wasmCollector = bindings?.collectCppReviewArtifactsJson;
  const fallbackArtifacts = collectFallbackCppReviewArtifacts(code, boardId);

  if (wasmCollector) {
    try {
      const result = JSON.parse(
        wasmCollector(JSON.stringify({ code, boardId }))
      ) as RawCppReviewArtifacts | null;

      if (result) {
        return mergeCppReviewArtifacts({
          language: 'cpp',
          operations: result.operations ?? [],
          i2cAddressUses: result.i2cAddressUses ?? [],
          interruptUses: result.interruptUses ?? [],
          includedHeaders: result.includedHeaders ?? [],
          parseTree: normalizeTreeBackend(result.parseTree ?? null),
        }, fallbackArtifacts);
      }
    } catch {
      // Fall back to the TypeScript collector below.
    }
  }

  return fallbackArtifacts;
}

export async function collectCppReviewArtifactsAsync(code: string, boardId: string): Promise<CppReviewArtifacts> {
  await ensureGeneratedModuMakeWasmKernelBindings();
  const artifacts = collectCppReviewArtifacts(code, boardId);
  if (artifacts.parseTree) {
    return artifacts;
  }

  return {
    ...artifacts,
    parseTree: await parseCpp(code),
  };
}
