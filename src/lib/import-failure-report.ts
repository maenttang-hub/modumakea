import type { KiCadFileKind } from '@/lib/kicad-file-kind';
import type { AppLanguage } from '@/types';

export type ImportFailureStage =
  | 'read'
  | 'detect'
  | 'parse-schematic'
  | 'parse-pcb'
  | 'hydrate'
  | 'unsupported';

export type ImportFailureReasonCategory =
  | 'unsupported-file'
  | 'read-error'
  | 'parse-error'
  | 'project-hydration-error'
  | 'unknown-error';

export interface ImportFailureReport {
  title: string;
  description: string;
  recoveryActions: string[];
  toastDescription: string;
  reasonCategory: ImportFailureReasonCategory;
  telemetry: {
    fileExtension: string;
    fileSizeBucket: string;
    fileKind: KiCadFileKind | 'unknown';
    stage: ImportFailureStage;
    reasonCategory: ImportFailureReasonCategory;
    errorCategory?: string;
  };
}

export interface ImportFailureReportInput {
  fileName?: string;
  fileSizeBytes?: number;
  fileKind?: KiCadFileKind | null;
  stage: ImportFailureStage;
  error?: unknown;
  language?: AppLanguage;
}

function pick(language: AppLanguage | undefined, ko: string, en: string) {
  return language === 'en' ? en : ko;
}

export function getFileExtensionForTelemetry(fileName?: string) {
  const normalized = fileName?.trim().toLowerCase() ?? '';
  const index = normalized.lastIndexOf('.');
  if (index < 0 || index === normalized.length - 1) {
    return 'none';
  }
  return normalized.slice(index).replace(/[^a-z0-9._-]/g, '').slice(0, 24) || 'unknown';
}

export function getFileSizeBucketForTelemetry(fileSizeBytes?: number) {
  if (typeof fileSizeBytes !== 'number' || !Number.isFinite(fileSizeBytes) || fileSizeBytes < 0) {
    return 'unknown';
  }
  if (fileSizeBytes === 0) {
    return 'empty';
  }
  if (fileSizeBytes < 100 * 1024) {
    return '<100kb';
  }
  if (fileSizeBytes < 1024 * 1024) {
    return '100kb-1mb';
  }
  if (fileSizeBytes < 5 * 1024 * 1024) {
    return '1mb-5mb';
  }
  return '5mb+';
}

export function buildImportFileTelemetryAttributes(input: {
  fileName?: string;
  fileSizeBytes?: number;
  fileKind?: KiCadFileKind | null;
}): {
  fileExtension: string;
  fileSizeBucket: string;
  fileKind: KiCadFileKind | 'unknown';
} {
  return {
    fileExtension: getFileExtensionForTelemetry(input.fileName),
    fileSizeBucket: getFileSizeBucketForTelemetry(input.fileSizeBytes),
    fileKind: input.fileKind ?? 'unknown',
  };
}

function errorToCategory(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  const normalized = message.toLowerCase();

  if (!normalized) {
    return undefined;
  }
  if (normalized.includes('permission') || normalized.includes('notallowed')) {
    return 'permission';
  }
  if (normalized.includes('too large') || normalized.includes('quota')) {
    return 'too-large';
  }
  if (normalized.includes('unexpected') || normalized.includes('parse') || normalized.includes('invalid')) {
    return 'invalid-kicad-syntax';
  }
  if (normalized.includes('empty')) {
    return 'empty-file';
  }
  return 'generic-error';
}

function errorToSafeDescription(error: unknown, language: AppLanguage | undefined) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  const safe = message.trim().replace(/\s+/g, ' ').slice(0, 180);
  if (!safe) {
    return pick(language, '파일을 읽거나 해석하는 중 문제가 발생했습니다.', 'There was a problem reading or interpreting the file.');
  }
  return safe;
}

function reasonForStage(stage: ImportFailureStage): ImportFailureReasonCategory {
  switch (stage) {
    case 'unsupported':
    case 'detect':
      return 'unsupported-file';
    case 'read':
      return 'read-error';
    case 'hydrate':
      return 'project-hydration-error';
    case 'parse-schematic':
    case 'parse-pcb':
      return 'parse-error';
    default:
      return 'unknown-error';
  }
}

export function buildImportFailureReport(input: ImportFailureReportInput): ImportFailureReport {
  const language = input.language;
  const reasonCategory = reasonForStage(input.stage);
  const telemetryBase = buildImportFileTelemetryAttributes({
    fileName: input.fileName,
    fileSizeBytes: input.fileSizeBytes,
    fileKind: input.fileKind,
  });

  const errorCategory = errorToCategory(input.error);
  const errorDescription = errorToSafeDescription(input.error, language);

  let title: string;
  let description: string;
  let recoveryActions: string[];

  if (reasonCategory === 'unsupported-file') {
    title = pick(language, 'KiCad 파일 형식을 확인해 주세요', 'Check the KiCad file type');
    description = pick(
      language,
      '이 화면은 KiCad 회로도와 PCB 텍스트 파일만 바로 가져올 수 있습니다.',
      'This review surface can directly import KiCad schematic and PCB text files.'
    );
    recoveryActions = [
      pick(language, '`.kicad_sch` 또는 `.kicad_pcb` 원본 파일을 올려 주세요.', 'Upload the original `.kicad_sch` or `.kicad_pcb` file.'),
      pick(language, '프로젝트 폴더, zip, PDF, 이미지 파일은 먼저 KiCad 원본으로 열어야 합니다.', 'Open project folders, zip files, PDFs, or images in KiCad first.'),
    ];
  } else if (reasonCategory === 'read-error') {
    title = pick(language, '파일을 읽지 못했습니다', 'Could not read the file');
    description = errorDescription;
    recoveryActions = [
      pick(language, '로컬 디스크에 있는 원본 파일을 다시 선택해 주세요.', 'Select the original file from local disk again.'),
      pick(language, '빈 파일이거나 권한이 막힌 파일이면 KiCad에서 다시 저장해 주세요.', 'If the file is empty or blocked by permissions, save it again from KiCad.'),
    ];
  } else if (reasonCategory === 'project-hydration-error') {
    title = pick(language, '프로젝트로 변환하지 못했습니다', 'Could not convert it into a project');
    description = errorDescription;
    recoveryActions = [
      pick(language, 'KiCad에서 회로도를 다시 저장한 뒤 재import해 주세요.', 'Save the schematic again in KiCad and re-import it.'),
      pick(language, '반복되면 파일 종류, 크기, 실패 화면을 피드백으로 보내 주세요.', 'If it repeats, send the file type, size, and failure screen as feedback.'),
    ];
  } else {
    title = pick(language, 'KiCad 해석에 실패했습니다', 'KiCad import failed');
    description = errorDescription;
    recoveryActions = [
      pick(language, 'zip이나 프로젝트 폴더가 아니라 실제 KiCad 텍스트 파일인지 확인해 주세요.', 'Check that this is the actual KiCad text file, not a zip or project folder.'),
      pick(language, '커스텀 심볼이 많은 경우 원본 `.kicad_sch`와 관련 라이브러리 정보를 함께 제보해 주세요.', 'For custom-heavy schematics, report the `.kicad_sch` file and related library context.'),
    ];
  }

  return {
    title,
    description,
    recoveryActions,
    toastDescription: [description, recoveryActions[0]].filter(Boolean).join(' '),
    reasonCategory,
    telemetry: {
      ...telemetryBase,
      stage: input.stage,
      reasonCategory,
      ...(errorCategory ? { errorCategory } : {}),
    },
  };
}
