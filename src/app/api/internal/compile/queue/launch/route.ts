import { NextResponse } from 'next/server';
import { getCompileBackendSharedToken } from '@/lib/compile-policy';
import {
  auditApiRequest,
  buildApiResponseHeaders,
  createApiRequestContext,
} from '@/lib/server/api-request';
import { launchNextCompileJob } from '@/lib/server/compile-queue-launcher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorizedRequest(request: Request) {
  const expectedToken = getCompileBackendSharedToken();
  if (!expectedToken) {
    return false;
  }

  return request.headers.get('x-modumake-compile-token')?.trim() === expectedToken;
}

export async function POST(req: Request) {
  const api = createApiRequestContext(req, 'internal.compile.queue.launch');
  auditApiRequest(api, 'start');

  if (!isAuthorizedRequest(req)) {
    auditApiRequest(api, 'error', { status: 401, message: 'unauthorized launcher request' });
    return NextResponse.json(
      {
        success: false,
        status: 'UNAUTHORIZED',
        requestId: api.requestId,
      },
      { status: 401, headers: buildApiResponseHeaders(api) }
    );
  }

  const result = await launchNextCompileJob(api.requestId);
  auditApiRequest(api, 'success', {
    status: 200,
    launched: result.launched,
    queueJobId: result.queueJobId,
    state: result.state,
  });

  return NextResponse.json(
    {
      success: true,
      status: result.launched ? 'QUEUE_JOB_PROCESSED' : 'QUEUE_IDLE',
      requestId: api.requestId,
      ...result,
    },
    { status: 200, headers: buildApiResponseHeaders(api) }
  );
}
