import { NextResponse } from 'next/server';
import { forkStoredCloudProject } from '@/lib/cloud-project-store';
import { sanitizePlainText } from '@/lib/security-input';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const editToken = request.headers.get('x-modumake-edit-token') ?? undefined;
    const payload = await request.json().catch(() => null) as {
      title?: unknown;
    } | null;

    const result = await forkStoredCloudProject({
      sourceProjectId: id,
      sourceEditToken: editToken,
      title:
        typeof payload?.title === 'string'
          ? sanitizePlainText(payload.title, { maxLength: 80, fallback: '' })
          : undefined,
    });

    return NextResponse.json({
      project: result.project,
      editToken: result.editToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '프로젝트 복제본을 만들지 못했습니다.';
    const status = message.includes('권한') ? 403 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
