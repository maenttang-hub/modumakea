import { NextResponse } from 'next/server';

import {
  getProjectValidationSummary,
  listProjectValidationJobs,
} from '@/lib/validation-jobs-store';
import {
  authorizeProjectValidationRead,
  getValidationAuthErrorStatus,
  getValidationEditToken,
} from '@/lib/validation-jobs-auth';
import { auditApiRequest, buildApiResponseHeaders, createApiRequestContext } from '@/lib/server/api-request';

export interface ProjectValidationJobsRouteDeps {
  listJobs: typeof listProjectValidationJobs;
  getSummary: typeof getProjectValidationSummary;
  authorizeRead: (
    projectId: string,
    editToken: string | undefined,
    request: Request
  ) => Promise<void>;
}

const defaultDeps: ProjectValidationJobsRouteDeps = {
  listJobs: listProjectValidationJobs,
  getSummary: getProjectValidationSummary,
  authorizeRead: authorizeProjectValidationRead,
};

export async function handleProjectValidationJobsGet(
  request: Request,
  context: { params: Promise<{ id: string }> },
  deps: ProjectValidationJobsRouteDeps = defaultDeps
) {
  const api = createApiRequestContext(request, 'projects.validation-jobs.list');
  auditApiRequest(api, 'start');

  try {
    const { id } = await context.params;
    await deps.authorizeRead(id, getValidationEditToken(request), request);

    const limitParam = new URL(request.url).searchParams.get('limit');
    const limit = Math.min(50, Math.max(1, Number.parseInt(limitParam ?? '10', 10) || 10));
    const [jobs, summary] = await Promise.all([
      deps.listJobs(id, limit),
      deps.getSummary(id),
    ]);

    auditApiRequest(api, 'success', { status: 200, projectId: id, count: jobs.length });
    return NextResponse.json(
      { projectId: id, jobs, summary, requestId: api.requestId },
      { headers: buildApiResponseHeaders(api) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '프로젝트 validation history 조회에 실패했습니다.';
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
  return handleProjectValidationJobsGet(request, context);
}
