import { NextResponse } from 'next/server';
import type { CompileJobRequest } from '@/types';
import {
  auditApiRequest,
  buildApiResponseHeaders,
  createApiRequestContext,
} from '@/lib/server/api-request';
import {
  getUnsandboxedCloudCompileDisabledReason,
  isUnsandboxedCloudCompileEnabled,
} from '@/lib/compile-policy';
import { submitCompileJob } from '@/lib/server/compile-backend';
import { getCompileJobDispatcher } from '@/lib/server/compile-dispatch';
import { sanitizePlainText } from '@/lib/security-input';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const api = createApiRequestContext(req, 'compile.job');
  auditApiRequest(api, 'start');
  try {
    if (!isUnsandboxedCloudCompileEnabled()) {
      const message = getUnsandboxedCloudCompileDisabledReason();
      auditApiRequest(api, 'error', { status: 503, message });
      return NextResponse.json(
        {
          success: false,
          status: 'COMPILATION_UNAVAILABLE',
          buildLogs: '',
          errorDetails: message,
          requestId: api.requestId,
        },
        { status: 503, headers: buildApiResponseHeaders(api) }
      );
    }

    const rawBody = (await req.json()) as CompileJobRequest;
    const payload: CompileJobRequest = {
      jobId: sanitizePlainText(rawBody?.jobId, { maxLength: 80 }),
      boardId: sanitizePlainText(rawBody?.boardId, { maxLength: 32 }),
      sourceCode:
        typeof rawBody?.sourceCode === 'string'
          ? rawBody.sourceCode.slice(0, 30000)
          : '',
      requiredLibraries: Array.isArray(rawBody?.requiredLibraries)
        ? rawBody.requiredLibraries.map(item => sanitizePlainText(item, { maxLength: 160 })).filter(Boolean)
        : [],
    };

    const dispatcher = getCompileJobDispatcher();
    const { httpStatus, result } = await submitCompileJob(payload, api.requestId);
    auditApiRequest(api, 'success', {
      status: httpStatus,
      boardId: payload.boardId,
      dispatchMode: dispatcher.mode,
    });
    return NextResponse.json(
      { ...result, requestId: api.requestId, dispatchMode: dispatcher.mode },
      { status: httpStatus, headers: buildApiResponseHeaders(api) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '컴파일 서버에 연결할 수 없습니다.';
    auditApiRequest(api, 'error', { status: 503, message });
    return NextResponse.json(
      {
        success: false,
        status: 'COMPILATION_UNAVAILABLE',
        buildLogs: '',
        errorDetails: message,
        requestId: api.requestId,
      },
      { status: 503, headers: buildApiResponseHeaders(api) }
    );
  }
}
