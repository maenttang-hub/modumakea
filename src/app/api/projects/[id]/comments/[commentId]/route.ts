import { NextResponse } from 'next/server';
import { updateStoredProjectComment } from '@/lib/cloud-comments-store';
import { sanitizeMultilineText } from '@/lib/security-input';
import type { ProjectCommentStatus } from '@/types';

function isCommentStatus(value: unknown): value is ProjectCommentStatus {
  return value === 'open' || value === 'resolved' || value === 'orphaned';
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await context.params;
    const editToken = request.headers.get('x-modumake-edit-token') ?? undefined;
    const payload = await request.json().catch(() => null) as {
      status?: unknown;
      content?: unknown;
    } | null;

    if (!payload) {
      return NextResponse.json({ error: '바꿀 피드백 정보가 없습니다.' }, { status: 400 });
    }

    const status = isCommentStatus(payload.status) ? payload.status : undefined;
    const content =
      typeof payload.content === 'string'
        ? sanitizeMultilineText(payload.content, {
            maxLength: 2400,
            fallback: '',
          })
        : undefined;

    if (!status && typeof content === 'undefined') {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const comment = await updateStoredProjectComment({
      projectId: id,
      commentId,
      editToken,
      status,
      content,
    });

    return NextResponse.json({ comment });
  } catch (error) {
    const message = error instanceof Error ? error.message : '피드백을 업데이트하지 못했습니다.';
    const status = message.includes('권한') ? 403 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
