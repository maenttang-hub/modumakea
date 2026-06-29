import { NextResponse } from 'next/server';
import { createStoredCloudProject } from '@/lib/cloud-project-store';
import { sanitizePlainText } from '@/lib/security-input';
import type { CloudProjectVisibility, ModuMakeProjectData } from '@/types';

function resolveVisibility(value: unknown): CloudProjectVisibility {
  return value === 'private' || value === 'public' ? value : 'unlisted';
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null) as {
      title?: unknown;
      visibility?: unknown;
      stateJson?: ModuMakeProjectData;
    } | null;

    if (!payload?.stateJson || typeof payload.stateJson !== 'object') {
      return NextResponse.json({ error: '저장할 프로젝트 상태가 없습니다.' }, { status: 400 });
    }

    const title =
      typeof payload.title === 'string'
        ? sanitizePlainText(payload.title, { maxLength: 80, fallback: 'Untitled Project' })
        : 'Untitled Project';

    const result = await createStoredCloudProject({
      title,
      visibility: resolveVisibility(payload.visibility),
      stateJson: payload.stateJson,
    });

    return NextResponse.json({
      project: result.project,
      editToken: result.editToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '클라우드 프로젝트를 만들지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
