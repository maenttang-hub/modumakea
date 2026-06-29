import { NextResponse } from 'next/server';

import {
  getProjectValidationSummary,
  listProjectValidationJobs,
} from '@/lib/validation-jobs-store';
import { auditApiRequest, buildApiResponseHeaders, createApiRequestContext } from '@/lib/server/api-request';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const api = createApiRequestContext(request, 'projects.validation-jobs.list');
  auditApiRequest(api, 'start');

  try {
    const { id } = await context.params;
    const limitParam = new URL(request.url).searchParams.get('limit');
    const limit = Math.min(50, Math.max(1, Number.parseInt(limitParam ?? '10', 10) || 10));
    const [jobs, summary] = await Promise.all([
      listProjectValidationJobs(id, limit),
      getProjectValidationSummary(id),
    ]);

    auditApiRequest(api, 'success', { status: 200, projectId: id, count: jobs.length });
    return NextResponse.json(
      { projectId: id, jobs, summary, requestId: api.requestId },
      { headers: buildApiResponseHeaders(api) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '프로젝트 validation history 조회에 실패했습니다.';
    auditApiRequest(api, 'error', { status: 500, message });
    return NextResponse.json(
      { error: message, requestId: api.requestId },
      { status: 500, headers: buildApiResponseHeaders(api) }
    );
  }
}
