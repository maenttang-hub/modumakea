import { NextResponse } from 'next/server';

import { getValidationJobDiff, getValidationJobProjectId } from '@/lib/validation-jobs-store';
import {
  authorizeProjectValidationRead,
  getValidationAuthErrorStatus,
  getValidationEditToken,
} from '@/lib/validation-jobs-auth';
import { auditApiRequest, buildApiResponseHeaders, createApiRequestContext } from '@/lib/server/api-request';

export interface ValidationJobDiffRouteDeps {
  getJobProjectId: (jobId: string) => Promise<string | null>;
  getDiff: typeof getValidationJobDiff;
  authorizeRead: (
    projectId: string,
    editToken: string | undefined,
    request: Request
  ) => Promise<void>;
}

const defaultDeps: ValidationJobDiffRouteDeps = {
  getJobProjectId: getValidationJobProjectId,
  getDiff: getValidationJobDiff,
  authorizeRead: authorizeProjectValidationRead,
};

export async function handleValidationJobDiffGet(
  request: Request,
  context: { params: Promise<{ id: string }> },
  deps: ValidationJobDiffRouteDeps = defaultDeps
) {
  const api = createApiRequestContext(request, 'validation-jobs.diff');
  auditApiRequest(api, 'start');

  try {
    const { id } = await context.params;
    const projectId = await deps.getJobProjectId(id);
    if (!projectId) {
      auditApiRequest(api, 'error', { status: 404 });
      return NextResponse.json(
        { error: 'Validation diff 대상을 찾지 못했습니다.', requestId: api.requestId },
        { status: 404, headers: buildApiResponseHeaders(api) }
      );
    }

    await deps.authorizeRead(projectId, getValidationEditToken(request), request);

    const baseline = new URL(request.url).searchParams.get('baseline');
    const diff = await deps.getDiff(id, baseline);
    if (!diff) {
      auditApiRequest(api, 'error', { status: 404 });
      return NextResponse.json(
        { error: 'Validation diff 대상을 찾지 못했습니다.', requestId: api.requestId },
        { status: 404, headers: buildApiResponseHeaders(api) }
      );
    }

    auditApiRequest(api, 'success', { status: 200, jobId: id, baseline: baseline ?? 'latest' });
    return NextResponse.json(
      { diff, requestId: api.requestId },
      { headers: buildApiResponseHeaders(api) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Validation diff 조회에 실패했습니다.';
    const status = getValidationAuthErrorStatus(message);
    auditApiRequest(api, 'error', { status, message });
    return NextResponse.json(
      { error: message, requestId: api.requestId },
      { status, headers: buildApiResponseHeaders(api) }
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return handleValidationJobDiffGet(request, context);
}
