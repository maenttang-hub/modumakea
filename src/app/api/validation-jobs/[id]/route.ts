import { NextResponse } from 'next/server';

import { getValidationJobDetail, getValidationJobProjectId } from '@/lib/validation-jobs-store';
import {
  authorizeProjectValidationRead,
  getValidationAuthErrorStatus,
  getValidationEditToken,
} from '@/lib/validation-jobs-auth';
import { auditApiRequest, buildApiResponseHeaders, createApiRequestContext } from '@/lib/server/api-request';

export interface ValidationJobDetailRouteDeps {
  getJobProjectId: (jobId: string) => Promise<string | null>;
  getJob: typeof getValidationJobDetail;
  authorizeRead: (
    projectId: string,
    editToken: string | undefined,
    request: Request
  ) => Promise<void>;
}

const defaultDeps: ValidationJobDetailRouteDeps = {
  getJobProjectId: getValidationJobProjectId,
  getJob: getValidationJobDetail,
  authorizeRead: authorizeProjectValidationRead,
};

export async function handleValidationJobDetailGet(
  request: Request,
  context: { params: Promise<{ id: string }> },
  deps: ValidationJobDetailRouteDeps = defaultDeps
) {
  const api = createApiRequestContext(request, 'validation-jobs.detail');
  auditApiRequest(api, 'start');

  try {
    const { id } = await context.params;
    const projectId = await deps.getJobProjectId(id);
    if (!projectId) {
      auditApiRequest(api, 'error', { status: 404 });
      return NextResponse.json(
        { error: 'Validation job를 찾지 못했습니다.', requestId: api.requestId },
        { status: 404, headers: buildApiResponseHeaders(api) }
      );
    }

    await deps.authorizeRead(projectId, getValidationEditToken(request), request);

    const job = await deps.getJob(id);
    if (!job) {
      auditApiRequest(api, 'error', { status: 404 });
      return NextResponse.json(
        { error: 'Validation job를 찾지 못했습니다.', requestId: api.requestId },
        { status: 404, headers: buildApiResponseHeaders(api) }
      );
    }

    auditApiRequest(api, 'success', { status: 200, jobId: id });
    return NextResponse.json(
      { job, requestId: api.requestId },
      { headers: buildApiResponseHeaders(api) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Validation job 조회에 실패했습니다.';
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
  return handleValidationJobDetailGet(request, context);
}
