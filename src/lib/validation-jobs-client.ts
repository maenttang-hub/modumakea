import { getBoardById } from '@/constants/boards';
import { fetchWithRetry } from '@/lib/fetch-with-retry';
import { resolveValidationAiInput } from '@/lib/resolve-validation-ai-input';
import type { ValidationJobIngestMetadata } from '@/lib/validation-job-ingest';
import type { LightweightValidationJson, ModuMakeProjectData } from '@/types';

interface ValidationJobRouteBody {
  validationInput: LightweightValidationJson;
  metadata: ValidationJobIngestMetadata;
}

type PersistValidationJobResult =
  | {
      success: true;
      skipped?: boolean;
      validationJobId?: string;
      validationSnapshotId?: string;
      validationSnapshotVersion?: number;
      requestId?: string;
    }
  | { success: false; error: string };

function dedupeStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim().length > 0)))];
}

function hasLegacyIntegratedSnapshot(document: ModuMakeProjectData) {
  return document.activeBoardId === 'kicad_generic' && Boolean(document.integratedValidationJson);
}

function shouldPersistImportedValidationJob(document: ModuMakeProjectData) {
  return Boolean(document.importedSchematicSource?.trim() || hasLegacyIntegratedSnapshot(document));
}

export function buildValidationJobRouteBody(
  projectId: string,
  document: ModuMakeProjectData
): ValidationJobRouteBody | null {
  if (!shouldPersistImportedValidationJob(document)) {
    return null;
  }

  const validationInput = resolveValidationAiInput({
    document,
    sourceCode: document.generatedCode,
  });
  const board = getBoardById(document.activeBoardId);

  return {
    // LightweightValidationJson is the canonical runtime/UI/AI contract.
    validationInput,
    metadata: {
      projectId,
      sourceKind: 'kicad_import',
      boardId: document.activeBoardId,
      boardName: board.name,
      logicVoltage: board.logicVoltage,
      boardPinNames: Object.keys(document.pins ?? {}),
      boardNetLabels: dedupeStrings(
        validationInput.nets.flatMap(net => [net.label, ...(net.aliases ?? [])])
      ),
      // The integrated snapshot stays optional and background-only.
      integratedModelJson: document.integratedValidationJson ?? undefined,
    },
  };
}

export async function persistImportedValidationJob(
  projectId: string,
  document: ModuMakeProjectData,
  editToken?: string
): Promise<PersistValidationJobResult> {
  const body = buildValidationJobRouteBody(projectId, document);
  if (!body) {
    return { success: true, skipped: true };
  }

  const requestId = globalThis.crypto?.randomUUID?.() ?? `validation-${Date.now()}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-request-id': requestId,
  };
  if (editToken) {
    headers['x-modumake-edit-token'] = editToken;
  }

  const response = await fetchWithRetry('/api/validation-jobs', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }, {
    requestId,
    retries: 2,
  });

  const payload = await response.json().catch(() => null) as
    | {
        validationJobId?: string;
        validationSnapshotId?: string;
        validationSnapshotVersion?: number;
        requestId?: string;
        error?: string;
      }
    | null;

  if (!response.ok) {
    return {
      success: false,
      error: payload?.error ?? 'Validation job 저장에 실패했습니다.',
    };
  }

  return {
    success: true,
    validationJobId: payload?.validationJobId,
    validationSnapshotId: payload?.validationSnapshotId,
    validationSnapshotVersion: payload?.validationSnapshotVersion,
    requestId: payload?.requestId,
  };
}
