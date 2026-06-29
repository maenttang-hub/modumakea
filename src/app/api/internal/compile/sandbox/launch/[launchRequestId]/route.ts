import { NextResponse } from 'next/server';
import { getCompileBackendSharedToken } from '@/lib/compile-policy';
import {
  auditApiRequest,
  buildApiResponseHeaders,
  createApiRequestContext,
} from '@/lib/server/api-request';
import {
  getCompileSandboxLaunchRequest,
  updateCompileSandboxLaunchRequestState,
} from '@/lib/server/compile-sandbox-request-store';
import { sanitizePlainText } from '@/lib/security-input';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorizedRequest(request: Request) {
  const expectedToken = getCompileBackendSharedToken();
  if (!expectedToken) {
    return false;
  }

  return request.headers.get('x-modumake-compile-token')?.trim() === expectedToken;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ launchRequestId: string }> }
) {
  const api = createApiRequestContext(req, 'internal.compile.sandbox.launch.update');
  auditApiRequest(api, 'start');

  if (!isAuthorizedRequest(req)) {
    auditApiRequest(api, 'error', { status: 401, message: 'unauthorized sandbox update request' });
    return NextResponse.json(
      {
        success: false,
        status: 'UNAUTHORIZED',
        requestId: api.requestId,
      },
      { status: 401, headers: buildApiResponseHeaders(api) }
    );
  }

  try {
    const { launchRequestId: rawLaunchRequestId } = await context.params;
    const launchRequestId = sanitizePlainText(rawLaunchRequestId, { maxLength: 80 });
    const rawBody = (await req.json()) as { state?: string; errorDetails?: string };
    const state = rawBody?.state === 'failed' ? 'failed' : rawBody?.state === 'submitted' ? 'submitted' : '';
    if (!state) {
      auditApiRequest(api, 'error', { status: 400, launchRequestId, message: 'invalid state' });
      return NextResponse.json(
        {
          success: false,
          status: 'BAD_REQUEST',
          error: 'state must be "submitted" or "failed".',
          requestId: api.requestId,
        },
        { status: 400, headers: buildApiResponseHeaders(api) }
      );
    }

    const updated = await updateCompileSandboxLaunchRequestState(launchRequestId, {
      state,
      errorDetails: sanitizePlainText(rawBody?.errorDetails, { maxLength: 2000 }) || undefined,
    });

    if (!updated) {
      auditApiRequest(api, 'error', { status: 404, launchRequestId });
      return NextResponse.json(
        {
          success: false,
          status: 'NOT_FOUND',
          error: 'sandbox launch request를 찾지 못했습니다.',
          requestId: api.requestId,
        },
        { status: 404, headers: buildApiResponseHeaders(api) }
      );
    }

    auditApiRequest(api, 'success', {
      status: 200,
      launchRequestId,
      state: updated.state,
    });

    return NextResponse.json(
      {
        success: true,
        status: state === 'submitted' ? 'SANDBOX_LAUNCH_REQUEST_SUBMITTED' : 'SANDBOX_LAUNCH_REQUEST_FAILED',
        requestId: api.requestId,
        launchRequest: updated,
      },
      { status: 200, headers: buildApiResponseHeaders(api) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sandbox launch request를 갱신하지 못했습니다.';
    auditApiRequest(api, 'error', { status: 500, message });
    return NextResponse.json(
      {
        success: false,
        status: 'INTERNAL_ERROR',
        error: message,
        requestId: api.requestId,
      },
      { status: 500, headers: buildApiResponseHeaders(api) }
    );
  }
}

export async function GET(
  req: Request,
  context: { params: Promise<{ launchRequestId: string }> }
) {
  const api = createApiRequestContext(req, 'internal.compile.sandbox.launch.get');
  auditApiRequest(api, 'start');

  if (!isAuthorizedRequest(req)) {
    auditApiRequest(api, 'error', { status: 401, message: 'unauthorized sandbox get request' });
    return NextResponse.json(
      {
        success: false,
        status: 'UNAUTHORIZED',
        requestId: api.requestId,
      },
      { status: 401, headers: buildApiResponseHeaders(api) }
    );
  }

  const { launchRequestId: rawLaunchRequestId } = await context.params;
  const launchRequestId = sanitizePlainText(rawLaunchRequestId, { maxLength: 80 });
  const launchRequest = await getCompileSandboxLaunchRequest(launchRequestId);

  if (!launchRequest) {
    auditApiRequest(api, 'error', { status: 404, launchRequestId });
    return NextResponse.json(
      {
        success: false,
        status: 'NOT_FOUND',
        error: 'sandbox launch request를 찾지 못했습니다.',
        requestId: api.requestId,
      },
      { status: 404, headers: buildApiResponseHeaders(api) }
    );
  }

  auditApiRequest(api, 'success', { status: 200, launchRequestId, state: launchRequest.state });
  return NextResponse.json(
    {
      success: true,
      status: 'SANDBOX_LAUNCH_REQUEST_READY',
      requestId: api.requestId,
      launchRequest,
    },
    { status: 200, headers: buildApiResponseHeaders(api) }
  );
}
