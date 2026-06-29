import { NextResponse } from 'next/server';

import { getValidationJobDetail } from '@/lib/validation-jobs-store';
import { auditApiRequest, buildApiResponseHeaders, createApiRequestContext } from '@/lib/server/api-request';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const api = createApiRequestContext(request, 'validation-jobs.detail');
  auditApiRequest(api, 'start');

  try {
    const { id } = await context.params;
    const job = await getValidationJobDetail(id);
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
    auditApiRequest(api, 'error', { status: 500, message });
    return NextResponse.json(
      { error: message, requestId: api.requestId },
      { status: 500, headers: buildApiResponseHeaders(api) }
    );
  }
}
