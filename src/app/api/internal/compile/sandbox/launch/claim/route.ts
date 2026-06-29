import { NextResponse } from 'next/server';
import { getCompileBackendSharedToken } from '@/lib/compile-policy';
import {
  auditApiRequest,
  buildApiResponseHeaders,
  createApiRequestContext,
} from '@/lib/server/api-request';
import { claimNextCompileSandboxLaunchRequest } from '@/lib/server/compile-sandbox-request-store';

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
  const api = createApiRequestContext(req, 'internal.compile.sandbox.launch.claim');
  auditApiRequest(api, 'start');

  if (!isAuthorizedRequest(req)) {
    auditApiRequest(api, 'error', { status: 401, message: 'unauthorized sandbox claim request' });
    return NextResponse.json(
      {
        success: false,
        status: 'UNAUTHORIZED',
        requestId: api.requestId,
      },
      { status: 401, headers: buildApiResponseHeaders(api) }
    );
  }

  const launchRequest = await claimNextCompileSandboxLaunchRequest();
  auditApiRequest(api, 'success', {
    status: 200,
    claimed: Boolean(launchRequest),
    launchRequestId: launchRequest?.launchRequestId,
    queueJobId: launchRequest?.queueJobId,
  });

  return NextResponse.json(
    launchRequest
      ? {
          success: true,
          status: 'SANDBOX_LAUNCH_REQUEST_CLAIMED',
          requestId: api.requestId,
          launchRequest,
        }
      : {
          success: true,
          status: 'SANDBOX_LAUNCH_REQUEST_IDLE',
          requestId: api.requestId,
        },
    { status: 200, headers: buildApiResponseHeaders(api) }
  );
}
