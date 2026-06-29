import { NextResponse } from 'next/server';
import { getCompileBackendSharedToken } from '@/lib/compile-policy';
import {
  auditApiRequest,
  buildApiResponseHeaders,
  createApiRequestContext,
} from '@/lib/server/api-request';
import { getCompileSandboxLaunchRequest, updateCompileSandboxLaunchRequestState } from '@/lib/server/compile-sandbox-request-store';
import { recordCompileExecutionResult } from '@/lib/server/compile-result-store';
import { updateCompileQueueJobState } from '@/lib/server/compile-queue-store';
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
  const api = createApiRequestContext(req, 'internal.compile.sandbox.result');
  auditApiRequest(api, 'start');

  if (!isAuthorizedRequest(req)) {
    auditApiRequest(api, 'error', { status: 401, message: 'unauthorized sandbox result request' });
    return NextResponse.json(
      { success: false, status: 'UNAUTHORIZED', requestId: api.requestId },
      { status: 401, headers: buildApiResponseHeaders(api) }
    );
  }

  try {
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

    const rawBody = (await req.json()) as {
      state?: string;
      buildLogs?: string;
      errorDetails?: string;
      hexBinary?: string;
    };

    const state =
      rawBody?.state === 'running'
        ? 'running'
        : rawBody?.state === 'succeeded'
          ? 'succeeded'
          : rawBody?.state === 'failed'
            ? 'failed'
            : '';

    if (!state) {
      auditApiRequest(api, 'error', { status: 400, launchRequestId, message: 'invalid state' });
      return NextResponse.json(
        {
          success: false,
          status: 'BAD_REQUEST',
          error: 'state must be "running", "succeeded", or "failed".',
          requestId: api.requestId,
        },
        { status: 400, headers: buildApiResponseHeaders(api) }
      );
    }

    const buildLogs = sanitizePlainText(rawBody?.buildLogs, { maxLength: 12000 }) || undefined;
    const errorDetails =
      sanitizePlainText(rawBody?.errorDetails, { maxLength: 2000 }) || undefined;
    const hexBinary =
      typeof rawBody?.hexBinary === 'string' ? rawBody.hexBinary.slice(0, 2_000_000) : undefined;

    const { result, artifact } = await recordCompileExecutionResult({
      launchRequestId,
      queueJobId: launchRequest.queueJobId,
      state,
      buildLogs,
      errorDetails,
      hexBinary,
    });

    await updateCompileSandboxLaunchRequestState(launchRequestId, {
      state: state === 'failed' ? 'failed' : 'submitted',
      latestResultId: result.resultId,
      errorDetails,
    });

    await updateCompileQueueJobState(launchRequest.queueJobId, {
      state,
      latestResultId: result.resultId,
      errorDetails,
    });

    auditApiRequest(api, 'success', {
      status: 200,
      launchRequestId,
      queueJobId: launchRequest.queueJobId,
      state,
      resultId: result.resultId,
      artifactId: artifact?.artifactId,
    });

    return NextResponse.json(
      {
        success: true,
        status:
          state === 'running'
            ? 'COMPILE_RESULT_RECORDED_RUNNING'
            : state === 'succeeded'
              ? 'COMPILE_RESULT_RECORDED_SUCCESS'
              : 'COMPILE_RESULT_RECORDED_FAILURE',
        requestId: api.requestId,
        result,
        artifact,
      },
      { status: 200, headers: buildApiResponseHeaders(api) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'compile result를 기록하지 못했습니다.';
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
