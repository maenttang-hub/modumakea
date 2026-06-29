import { NextResponse } from 'next/server';
import {
  createStoredProjectComment,
  listStoredProjectComments,
} from '@/lib/cloud-comments-store';
import { sanitizeMultilineText, sanitizePlainText } from '@/lib/security-input';
import type {
  ProjectCommentTargetMeta,
  ProjectCommentTargetType,
} from '@/types';

function isTargetType(value: unknown): value is ProjectCommentTargetType {
  return value === 'canvas_coord' || value === 'node' || value === 'wire' || value === 'code_line';
}

function isTargetMeta(value: unknown): value is ProjectCommentTargetMeta {
  return typeof value === 'object' && value !== null;
}

function normalizeTargetMeta(
  targetType: ProjectCommentTargetType,
  raw: ProjectCommentTargetMeta
): ProjectCommentTargetMeta | null {
  if (targetType === 'canvas_coord') {
    const value = raw as { x?: unknown; y?: unknown };
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
      return null;
    }
    return {
      x: Math.round(Number(value.x)),
      y: Math.round(Number(value.y)),
    };
  }

  if (targetType === 'node') {
    const value = raw as { nodeId?: unknown; x?: unknown; y?: unknown };
    const nodeId = sanitizePlainText(value.nodeId, { maxLength: 120, fallback: '' });
    if (!nodeId) {
      return null;
    }
    return {
      nodeId,
      x: Number.isFinite(value.x) ? Math.round(Number(value.x)) : undefined,
      y: Number.isFinite(value.y) ? Math.round(Number(value.y)) : undefined,
    };
  }

  if (targetType === 'wire') {
    const value = raw as { wireId?: unknown; x?: unknown; y?: unknown };
    const wireId = sanitizePlainText(value.wireId, { maxLength: 160, fallback: '' });
    if (!wireId) {
      return null;
    }
    return {
      wireId,
      x: Number.isFinite(value.x) ? Math.round(Number(value.x)) : undefined,
      y: Number.isFinite(value.y) ? Math.round(Number(value.y)) : undefined,
    };
  }

  const value = raw as { lineNumber?: unknown };
  if (!Number.isFinite(value.lineNumber)) {
    return null;
  }
  return {
    lineNumber: Math.max(1, Math.trunc(Number(value.lineNumber))),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const editToken = request.headers.get('x-modumake-edit-token') ?? undefined;
    const comments = await listStoredProjectComments(id, editToken);

    return NextResponse.json({ comments });
  } catch (error) {
    const message = error instanceof Error ? error.message : '피드백 목록을 읽지 못했습니다.';
    const status = message.includes('권한') ? 403 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const editToken = request.headers.get('x-modumake-edit-token') ?? undefined;
    const payload = await request.json().catch(() => null) as {
      content?: unknown;
      targetType?: unknown;
      targetMeta?: unknown;
      parentId?: unknown;
    } | null;

    const content = sanitizeMultilineText(payload?.content, {
      maxLength: 2400,
      fallback: '',
    });

    if (!content) {
      return NextResponse.json({ error: '피드백 내용을 입력해 주세요.' }, { status: 400 });
    }

    if (!isTargetType(payload?.targetType) || !isTargetMeta(payload?.targetMeta)) {
      return NextResponse.json({ error: '피드백 위치 정보가 올바르지 않습니다.' }, { status: 400 });
    }

    const targetMeta = normalizeTargetMeta(payload.targetType, payload.targetMeta);
    if (!targetMeta) {
      return NextResponse.json({ error: '피드백 위치 정보를 정리하지 못했습니다.' }, { status: 400 });
    }

    const comment = await createStoredProjectComment({
      projectId: id,
      editToken,
      content,
      targetType: payload.targetType,
      targetMeta,
      parentId: typeof payload.parentId === 'string' ? payload.parentId : null,
    });

    return NextResponse.json({ comment });
  } catch (error) {
    const message = error instanceof Error ? error.message : '피드백을 저장하지 못했습니다.';
    const status = message.includes('권한') ? 403 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
