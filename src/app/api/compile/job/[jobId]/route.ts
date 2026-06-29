import { NextResponse } from 'next/server';
import {
  auditApiRequest,
  buildApiResponseHeaders,
  createApiRequestContext,
} from '@/lib/server/api-request';
import { issueCompileArtifactDownloadPath } from '@/lib/server/compile-artifact-blob-store';
import { getCompileQueueJob } from '@/lib/server/compile-queue-store';
import { getCompileArtifact, getCompileExecutionResult } from '@/lib/server/compile-result-store';
import { sanitizePlainText } from '@/lib/security-input';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const api = createApiRequestContext(request, 'compile.job.status');
  auditApiRequest(api, 'start');

  try {
    const { jobId: rawJobId } = await context.params;
    const jobId = sanitizePlainText(rawJobId, { maxLength: 80 });
    const job = await getCompileQueueJob(jobId);

    if (!job) {
      auditApiRequest(api, 'error', { status: 404, queueJobId: jobId });
      return NextResponse.json(
        { error: '컴파일 큐 작업을 찾지 못했습니다.', requestId: api.requestId },
        { status: 404, headers: buildApiResponseHeaders(api) }
      );
    }

    const latestResult = job.latestResultId
      ? await getCompileExecutionResult(job.latestResultId)
      : null;
    const latestArtifact = latestResult?.primaryArtifactId
      ? await getCompileArtifact(latestResult.primaryArtifactId)
      : null;
    const latestArtifactDownloadPath = latestArtifact
      ? issueCompileArtifactDownloadPath(latestArtifact.artifactId)
      : null;

    auditApiRequest(api, 'success', { status: 200, queueJobId: jobId, state: job.state });
    return NextResponse.json(
      { job, latestResult, latestArtifact, latestArtifactDownloadPath, requestId: api.requestId },
      { status: 200, headers: buildApiResponseHeaders(api) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '컴파일 큐 상태를 읽지 못했습니다.';
    auditApiRequest(api, 'error', { status: 500, message });
    return NextResponse.json(
      { error: message, requestId: api.requestId },
      { status: 500, headers: buildApiResponseHeaders(api) }
    );
  }
}
