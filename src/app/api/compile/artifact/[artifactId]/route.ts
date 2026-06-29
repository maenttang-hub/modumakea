import { NextResponse } from 'next/server';
import {
  auditApiRequest,
  buildApiResponseHeaders,
  createApiRequestContext,
} from '@/lib/server/api-request';
import { verifyCompileArtifactDownloadSignature } from '@/lib/server/compile-artifact-blob-store';
import { getCompileArtifactBlob } from '@/lib/server/compile-result-store';
import { sanitizePlainText } from '@/lib/security-input';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ artifactId: string }> }
) {
  const api = createApiRequestContext(request, 'compile.artifact.download');
  auditApiRequest(api, 'start');

  try {
    const { artifactId: rawArtifactId } = await context.params;
    const artifactId = sanitizePlainText(rawArtifactId, { maxLength: 80 });
    const url = new URL(request.url);
    const expiresAt = sanitizePlainText(url.searchParams.get('expires'), { maxLength: 32 });
    const signature = sanitizePlainText(url.searchParams.get('signature'), { maxLength: 128 });

    if (!artifactId || !expiresAt || !signature) {
      auditApiRequest(api, 'error', { status: 401, artifactId, message: 'missing signature' });
      return NextResponse.json(
        { error: 'artifact download signature is required.', requestId: api.requestId },
        { status: 401, headers: buildApiResponseHeaders(api) }
      );
    }

    if (!verifyCompileArtifactDownloadSignature({ artifactId, expiresAt, signature })) {
      auditApiRequest(api, 'error', { status: 401, artifactId, message: 'invalid signature' });
      return NextResponse.json(
        { error: 'artifact download signature is invalid or expired.', requestId: api.requestId },
        { status: 401, headers: buildApiResponseHeaders(api) }
      );
    }

    const artifactBlob = await getCompileArtifactBlob(artifactId);
    if (!artifactBlob) {
      auditApiRequest(api, 'error', { status: 404, artifactId });
      return NextResponse.json(
        { error: 'compile artifact를 찾지 못했습니다.', requestId: api.requestId },
        { status: 404, headers: buildApiResponseHeaders(api) }
      );
    }

    auditApiRequest(api, 'success', { status: 200, artifactId });
    return new NextResponse(Buffer.from(artifactBlob.contentBase64, 'base64'), {
      status: 200,
      headers: {
        ...buildApiResponseHeaders(api),
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${artifactId}.${artifactBlob.artifact.kind}"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'compile artifact를 읽지 못했습니다.';
    auditApiRequest(api, 'error', { status: 500, message });
    return NextResponse.json(
      { error: message, requestId: api.requestId },
      { status: 500, headers: buildApiResponseHeaders(api) }
    );
  }
}
