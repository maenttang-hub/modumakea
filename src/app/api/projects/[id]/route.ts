import { NextResponse } from 'next/server';
import {
  getStoredCloudProject,
  updateStoredCloudProject,
} from '@/lib/cloud-project-store';
import { sanitizePlainText } from '@/lib/security-input';
import type { CloudProjectVisibility, ModuMakeProjectData } from '@/types';

function resolveVisibility(value: unknown): CloudProjectVisibility | undefined {
  return value === 'private' || value === 'public' || value === 'unlisted' ? value : undefined;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const editToken = request.headers.get('x-modumake-edit-token') ?? undefined;
    const project = await getStoredCloudProject(id, editToken);

    return NextResponse.json({ project });
  } catch (error) {
    const message = error instanceof Error ? error.message : '프로젝트를 읽지 못했습니다.';
    const status = message.includes('권한') ? 403 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const editToken = request.headers.get('x-modumake-edit-token') ?? undefined;
    const payload = await request.json().catch(() => null) as {
      title?: unknown;
      visibility?: unknown;
      stateJson?: ModuMakeProjectData;
    } | null;

    if (!payload) {
      return NextResponse.json({ error: '수정할 내용이 없습니다.' }, { status: 400 });
    }

    const project = await updateStoredCloudProject({
      projectId: id,
      editToken,
      title:
        typeof payload.title === 'string'
          ? sanitizePlainText(payload.title, { maxLength: 80, fallback: 'Untitled Project' })
          : undefined,
      visibility: resolveVisibility(payload.visibility),
      stateJson: payload.stateJson,
    });

    return NextResponse.json({ project });
  } catch (error) {
    const message = error instanceof Error ? error.message : '프로젝트를 저장하지 못했습니다.';
    const status = message.includes('권한') ? 403 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
