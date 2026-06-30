import { getBoardById } from '@/constants/boards';
import {
  buildArduinoDependencyFromCatalogEntry,
  findArduinoLibraryByHeader,
  findArduinoLibraryByName,
} from '@/lib/arduino-library-registry';
import {
  getPublicCloudCompileDisabledReason,
  getUnsandboxedCloudCompileDisabledReason,
  isPublicCloudCompileEnabled,
  isUnsandboxedCloudCompileEnabled,
} from '@/lib/compile-policy';
import type {
  AICodeGenerationPayload,
  CompilerCloudTarget,
  CompilerLibraryRequirement,
  CompilerManifest,
  CompilerPreflightResponse,
  CustomComponentPackage,
  SoftwareLibraryDependency,
} from '@/types';

const PLATFORMIO_BOARD_MAP: Record<string, { platform: string; board: string; fqbn: string }> = {
  uno: { platform: 'atmelavr', board: 'uno', fqbn: 'arduino:avr:uno' },
  nano: { platform: 'atmelavr', board: 'nanoatmega328', fqbn: 'arduino:avr:nano:cpu=atmega328' },
  esp32: { platform: 'espressif32', board: 'esp32dev', fqbn: 'esp32:esp32:esp32' },
};

const CORE_HEADER_SET = new Set([
  'Arduino.h',
  'Wire.h',
  'SPI.h',
  'SoftwareSerial.h',
]);

function buildDependencyKey(dependency: SoftwareLibraryDependency) {
  return `${dependency.registry ?? 'arduino'}:${dependency.name}:${dependency.version ?? ''}`;
}

function normalizeToken(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeHeader(input: string) {
  return input.trim().replace(/^<|>$/g, '').replace(/^"|"$/g, '');
}

function buildDependencyLabel(dependency: SoftwareLibraryDependency) {
  return dependency.version ? `${dependency.name}@${dependency.version}` : dependency.name;
}

function extractIncludesFromCode(code?: string | null) {
  if (!code) {
    return [];
  }

  const includePattern = /^\s*#include\s+(?:[<"]([^>"]+)[>"]|([A-Za-z0-9_./-]+))/gm;
  const headers = new Set<string>();

  for (const match of code.matchAll(includePattern)) {
    const header = normalizeHeader(match[1] ?? match[2] ?? '');
    if (header) {
      headers.add(header);
    }
  }

  return Array.from(headers);
}

function collectPayloadDependencies(payload: AICodeGenerationPayload) {
  const unique = new Map<string, SoftwareLibraryDependency>();

  for (const component of payload.connectedComponents) {
    for (const dependency of component.dependencies?.arduino ?? []) {
      unique.set(buildDependencyKey(dependency), dependency);
    }
  }

  for (const installedLibrary of payload.installedLibraries ?? []) {
    unique.set(
      buildDependencyKey({
        name: installedLibrary.name,
        version: installedLibrary.version === 'latest' ? undefined : installedLibrary.version,
        registry: 'arduino',
      }),
      {
        name: installedLibrary.name,
        version: installedLibrary.version === 'latest' ? undefined : installedLibrary.version,
        registry: 'arduino',
      }
    );
  }

  return Array.from(unique.values());
}

function collectPayloadHeaders(payload: AICodeGenerationPayload) {
  const componentHeaders = new Set<string>();

  for (const component of payload.connectedComponents) {
    for (const include of component.libraryIncludes ?? []) {
      const header = normalizeHeader(include);
      if (header) {
        componentHeaders.add(header);
      }
    }
  }

  for (const library of payload.installedLibraries ?? []) {
    for (const include of library.includes ?? []) {
      const header = normalizeHeader(include);
      if (header) {
        componentHeaders.add(header);
      }
    }
  }

  return Array.from(componentHeaders);
}

function inferDependencyForHeader(
  header: string,
  dependencies: SoftwareLibraryDependency[]
): SoftwareLibraryDependency | null {
  const known = findArduinoLibraryByHeader(header);
  if (known) {
    return buildArduinoDependencyFromCatalogEntry(known);
  }

  const normalizedHeader = normalizeToken(header.replace(/\.h$/i, ''));
  return (
    dependencies.find(dependency => {
      const normalizedName = normalizeToken(dependency.name);
      return normalizedName.includes(normalizedHeader) || normalizedHeader.includes(normalizedName);
    }) ?? null
  );
}

function collectAugmentedDependencies(payload: AICodeGenerationPayload, code?: string | null) {
  const explicitDependencies = collectPayloadDependencies(payload);
  const allHeaders = new Set<string>([
    ...collectPayloadHeaders(payload),
    ...extractIncludesFromCode(code),
  ]);
  const unique = new Map<string, SoftwareLibraryDependency>();

  for (const dependency of explicitDependencies) {
    unique.set(buildDependencyKey(dependency), dependency);
  }

  for (const header of allHeaders) {
    if (CORE_HEADER_SET.has(header)) {
      continue;
    }

    const inferred = inferDependencyForHeader(header, explicitDependencies);
    if (inferred) {
      unique.set(buildDependencyKey(inferred), inferred);
    }
  }

  return Array.from(unique.values());
}

function buildLibraryRequirements(payload: AICodeGenerationPayload, code?: string | null) {
  const componentHeaders = collectPayloadHeaders(payload);
  const codeHeaders = extractIncludesFromCode(code);
  const explicitDependencies = collectPayloadDependencies(payload);
  const requirements = new Map<string, CompilerLibraryRequirement>();

  const upsertRequirement = (
    header: string,
    source: CompilerLibraryRequirement['source'],
    dependency: SoftwareLibraryDependency | null
  ) => {
    const normalized = normalizeHeader(header);
    const isCore = CORE_HEADER_SET.has(normalized);
    const resolved = isCore || Boolean(dependency);
    const nextRequirement: CompilerLibraryRequirement = {
      header: normalized,
      source,
      registry: dependency?.registry ?? (isCore ? 'arduino' : undefined),
      dependencyLabel: dependency ? buildDependencyLabel(dependency) : undefined,
      resolved,
    };

    const previous = requirements.get(normalized);
    if (!previous) {
      requirements.set(normalized, nextRequirement);
      return;
    }

    requirements.set(normalized, {
      ...previous,
      source: previous.source === 'component-dependency' ? previous.source : nextRequirement.source,
      dependencyLabel: previous.dependencyLabel ?? nextRequirement.dependencyLabel,
      registry: previous.registry ?? nextRequirement.registry,
      resolved: previous.resolved || nextRequirement.resolved,
    });
  };

  for (const header of componentHeaders) {
    upsertRequirement(header, 'component-include', inferDependencyForHeader(header, explicitDependencies));
  }

  for (const header of codeHeaders) {
    upsertRequirement(header, 'code-include', inferDependencyForHeader(header, explicitDependencies));
  }

  for (const dependency of explicitDependencies) {
    const dependencyLabel = buildDependencyLabel(dependency);
    const matchingHeader = [...requirements.values()].find(requirement => requirement.dependencyLabel === dependencyLabel);
    if (matchingHeader) {
      continue;
    }

    const fallbackHeader = `${dependency.name.replace(/\s+library$/i, '').replace(/\s+/g, '_')}.h`;
    requirements.set(`dep:${dependencyLabel}`, {
      header: fallbackHeader,
      source: 'component-dependency',
      registry: dependency.registry ?? 'arduino',
      dependencyLabel,
      resolved: true,
    });
  }

  return Array.from(requirements.values())
    .filter(requirement => !requirement.header.startsWith('dep:'))
    .sort((a, b) => a.header.localeCompare(b.header));
}

function buildCloudTarget(payload: AICodeGenerationPayload): CompilerCloudTarget {
  const board = getBoardById(payload.boardId);

  if (board.targetLanguage !== 'C++') {
    return {
      provider: 'micropython',
      supported: false,
      boardId: payload.boardId,
      boardName: board.name,
      targetLanguage: board.targetLanguage,
      reason: '현재 클라우드 컴파일 경로는 Arduino C++ 보드만 준비되어 있습니다.',
    };
  }

  const env = PLATFORMIO_BOARD_MAP[payload.boardId];
  if (!env) {
    return {
      provider: 'arduino-cli',
      supported: false,
      boardId: payload.boardId,
      boardName: board.name,
      targetLanguage: board.targetLanguage,
      reason: '이 보드는 아직 클라우드 컴파일 대상 FQBN 매핑이 준비되지 않았습니다.',
    };
  }

  if (!isPublicCloudCompileEnabled()) {
    return {
      provider: 'arduino-cli',
      supported: false,
      boardId: payload.boardId,
      boardName: board.name,
      targetLanguage: board.targetLanguage,
      fqbn: env.fqbn,
      reason: getPublicCloudCompileDisabledReason(),
    };
  }

  if (!isUnsandboxedCloudCompileEnabled()) {
    return {
      provider: 'arduino-cli',
      supported: false,
      boardId: payload.boardId,
      boardName: board.name,
      targetLanguage: board.targetLanguage,
      fqbn: env.fqbn,
      reason: getUnsandboxedCloudCompileDisabledReason(),
    };
  }

  return {
    provider: 'arduino-cli',
    supported: true,
    boardId: payload.boardId,
    boardName: board.name,
    targetLanguage: board.targetLanguage,
    fqbn: env.fqbn,
  };
}

function buildPlatformIoConfigInternal(
  boardId: string,
  targetLanguage: ReturnType<typeof getBoardById>['targetLanguage'],
  dependencies: SoftwareLibraryDependency[]
) {
  if (targetLanguage !== 'C++') {
    return null;
  }

  const env = PLATFORMIO_BOARD_MAP[boardId];
  if (!env) {
    return null;
  }

  const libDeps = dependencies.length > 0
    ? dependencies.map(dep => `    ${buildDependencyLabel(dep)}`).join('\n')
    : '    ; no external libraries';

  return [
    `[env:${boardId}]`,
    `platform = ${env.platform}`,
    `board = ${env.board}`,
    'framework = arduino',
    'lib_deps =',
    libDeps,
  ].join('\n');
}

export function collectArduinoDependencies(packages: CustomComponentPackage[]) {
  const unique = new Map<string, SoftwareLibraryDependency>();

  for (const pkg of packages) {
    for (const dependency of pkg.dependencies?.arduino ?? []) {
      unique.set(buildDependencyKey(dependency), dependency);
    }
  }

  return Array.from(unique.values());
}

export function buildInstalledLibraryDependencies(names: string[]) {
  return names
    .map(name => findArduinoLibraryByName(name))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map(entry => buildArduinoDependencyFromCatalogEntry(entry));
}

export function formatArduinoDependencyLabel(dependency: SoftwareLibraryDependency) {
  return buildDependencyLabel(dependency);
}

export function buildPlatformIoConfigForPackages(boardId: string, packages: CustomComponentPackage[]) {
  const board = getBoardById(boardId);
  return buildPlatformIoConfigInternal(boardId, board.targetLanguage, collectArduinoDependencies(packages));
}

export function collectArduinoDependenciesFromPayload(payload: AICodeGenerationPayload, code?: string | null) {
  return collectAugmentedDependencies(payload, code);
}

export function buildPlatformIoConfig(payload: AICodeGenerationPayload, code?: string | null) {
  const board = getBoardById(payload.boardId);
  return buildPlatformIoConfigInternal(payload.boardId, board.targetLanguage, collectAugmentedDependencies(payload, code));
}

export function buildCompilerManifest(payload: AICodeGenerationPayload, code?: string | null): CompilerManifest {
  const dependencies = collectAugmentedDependencies(payload, code);
  const libraryRequirements = buildLibraryRequirements(payload, code);
  const unresolvedHeaders = libraryRequirements
    .filter(requirement => !requirement.resolved)
    .map(requirement => requirement.header);
  const cloudTarget = buildCloudTarget(payload);
  const compileStrategy =
    cloudTarget.supported && unresolvedHeaders.length === 0
      ? 'cloud-compiler-ready'
      : 'local-review-only';

  return {
    compileStrategy,
    platformioConfig: buildPlatformIoConfig(payload, code),
    arduinoDependencies: dependencies.map(buildDependencyLabel),
    requiredHeaders: libraryRequirements.map(requirement => requirement.header),
    unresolvedHeaders,
    libraryRequirements,
    cloudTarget,
  };
}

export function buildCompilerPreflightResponse(
  payload: AICodeGenerationPayload,
  code?: string | null
): CompilerPreflightResponse {
  const manifest = buildCompilerManifest(payload, code);
  const ready = manifest.compileStrategy === 'cloud-compiler-ready';
  const unresolvedRequirements = manifest.unresolvedHeaders.map(
    header => `${header} 헤더의 라이브러리 매핑을 아직 모릅니다.`
  );

  const summary = ready
    ? `${manifest.cloudTarget.boardName} 보드를 ${manifest.cloudTarget.provider} 경로로 바로 컴파일할 수 있습니다.`
    : manifest.cloudTarget.supported
      ? `클라우드 컴파일 경로는 준비됐지만, 확인이 필요한 헤더 ${manifest.unresolvedHeaders.length}개가 있습니다.`
      : manifest.cloudTarget.reason ?? '현재 보드는 로컬 검토 전용입니다.';

  return {
    ready,
    manifest,
    summary,
    unresolvedRequirements,
  };
}
