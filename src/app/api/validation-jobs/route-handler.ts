import { NextResponse } from 'next/server';

import {
  auditApiRequest,
  buildApiResponseHeaders,
  createApiRequestContext,
} from '@/lib/server/api-request';
import {
  ingestLightweightValidationJson,
  type ValidationJobIngestMetadata,
  type ValidationJobIngestPlan,
} from '@/lib/validation-job-ingest';
import type { LightweightValidationJson } from '@/types';

interface ValidationJobsRouteBody {
  validationInput?: unknown;
  metadata?: unknown;
}

export interface ValidationJobsRouteDeps {
  ingest: (
    validationInput: LightweightValidationJson,
    metadata: ValidationJobIngestMetadata
  ) => Promise<ValidationJobIngestPlan>;
}

const defaultDeps: ValidationJobsRouteDeps = {
  ingest: ingestLightweightValidationJson,
};

function isLightweightValidationInput(value: unknown): value is LightweightValidationJson {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<LightweightValidationJson>;
  return Boolean(
    candidate.source &&
      typeof candidate.source === 'object' &&
      Array.isArray(candidate.components) &&
      Array.isArray(candidate.nets) &&
      candidate.unresolved &&
      typeof candidate.unresolved === 'object' &&
      candidate.stats &&
      typeof candidate.stats === 'object'
  );
}

function isValidationJobSourceKind(value: unknown): value is ValidationJobIngestMetadata['sourceKind'] {
  return value === 'kicad_import' || value === 'modumake_canvas';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string');
}

function isValidationJobMetadata(value: unknown): value is ValidationJobIngestMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<ValidationJobIngestMetadata>;
  if (typeof candidate.projectId !== 'string' || candidate.projectId.trim().length === 0) {
    return false;
  }

  if (!isValidationJobSourceKind(candidate.sourceKind)) {
    return false;
  }

  if (candidate.boardPinNames !== undefined && !isStringArray(candidate.boardPinNames)) {
    return false;
  }

  if (candidate.boardNetLabels !== undefined && !isStringArray(candidate.boardNetLabels)) {
    return false;
  }

  return true;
}

function buildRouteResponse(plan: ValidationJobIngestPlan) {
  return {
    validationJobId: plan.validationJob.id,
    validationSnapshotId: plan.validationSnapshot.id,
    validationSnapshotVersion: plan.validationSnapshot.version,
    projectId: plan.validationJob.project_id,
    status: plan.validationJob.status,
    counts: {
      components: plan.componentInstances.length,
      nets: plan.validationNets.length,
      netMembers: plan.validationNetMembers.length,
      codePinUsages: plan.codePinUsages.length,
      findings: plan.errorFindings.length,
    },
  };
}

export async function handleValidationJobsPost(
  request: Request,
  deps: ValidationJobsRouteDeps = defaultDeps
) {
  const api = createApiRequestContext(request, 'validation-jobs.create');
  auditApiRequest(api, 'start');

  try {
    const payload = await request.json().catch(() => null) as ValidationJobsRouteBody | null;

    if (!payload) {
      auditApiRequest(api, 'error', { status: 400, reason: 'missing-payload' });
      return NextResponse.json(
        { error: '저장할 validation payload가 없습니다.', requestId: api.requestId },
        { status: 400, headers: buildApiResponseHeaders(api) }
      );
    }

    if (!isLightweightValidationInput(payload.validationInput)) {
      auditApiRequest(api, 'error', { status: 400, reason: 'invalid-validation-input' });
      return NextResponse.json(
        { error: 'validationInput 형식이 올바르지 않습니다.', requestId: api.requestId },
        { status: 400, headers: buildApiResponseHeaders(api) }
      );
    }

    if (!isValidationJobMetadata(payload.metadata)) {
      auditApiRequest(api, 'error', { status: 400, reason: 'invalid-metadata' });
      return NextResponse.json(
        { error: 'metadata.projectId와 metadata.sourceKind는 필수입니다.', requestId: api.requestId },
        { status: 400, headers: buildApiResponseHeaders(api) }
      );
    }

    const plan = await deps.ingest(payload.validationInput, {
      ...payload.metadata,
      requestId: api.requestId,
    });
    auditApiRequest(api, 'success', {
      status: 200,
      projectId: plan.validationJob.project_id,
      jobId: plan.validationJob.id,
      snapshotVersion: plan.validationSnapshot.version,
    });
    return NextResponse.json(
      { ...buildRouteResponse(plan), requestId: api.requestId },
      { headers: buildApiResponseHeaders(api) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Validation job 저장에 실패했습니다.';
    const status = /not configured/i.test(message) ? 503 : 500;
    auditApiRequest(api, 'error', { status, message });
    return NextResponse.json(
      { error: message, requestId: api.requestId },
      { status, headers: buildApiResponseHeaders(api) }
    );
  }
}
