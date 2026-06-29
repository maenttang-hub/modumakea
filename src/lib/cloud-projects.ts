import { DEFAULT_APP_LANGUAGE, getVisibilityDescription, getVisibilityLabel } from '@/lib/ui-language';
import type { AppLanguage, CloudProjectVisibility, ModuMakeProjectData } from '@/types';

export interface CloudProjectRecord {
  id: string;
  title: string;
  visibility: CloudProjectVisibility;
  stateJson: ModuMakeProjectData;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
}

type CloudProjectResponse = {
  project: CloudProjectRecord;
  editToken?: string;
};

type CloudProjectActionResult =
  | { success: true; project: CloudProjectRecord; editToken?: string }
  | { success: false; error: string };

function buildHeaders(editToken?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (editToken) {
    headers['x-modumake-edit-token'] = editToken;
  }

  return headers;
}

async function parseActionResponse(response: Response): Promise<CloudProjectActionResult> {
  const payload = await response.json().catch(() => null) as
    | (Partial<CloudProjectResponse> & { error?: string })
    | null;

  if (!response.ok || !payload?.project) {
    return {
      success: false,
      error: payload?.error ?? '클라우드 프로젝트 요청이 실패했습니다.',
    };
  }

  return {
    success: true,
    project: payload.project,
    editToken: payload.editToken,
  };
}

export function buildCloudProjectPath(projectId: string) {
  return `/p/${projectId}`;
}

export function getCloudProjectVisibilityLabel(
  visibility: CloudProjectVisibility,
  language: AppLanguage = DEFAULT_APP_LANGUAGE
) {
  return getVisibilityLabel(language, visibility);
}

export function getCloudProjectVisibilityDescription(
  visibility: CloudProjectVisibility,
  language: AppLanguage = DEFAULT_APP_LANGUAGE
) {
  return getVisibilityDescription(language, visibility);
}

export function buildCloudProjectShareSummary(input: {
  title: string;
  visibility: CloudProjectVisibility;
  language?: AppLanguage;
}) {
  const language = input.language ?? DEFAULT_APP_LANGUAGE;
  const cleanedTitle = input.title.trim() || (language === 'ko' ? '이름 없는 프로젝트' : 'Untitled project');
  const visibilityLabel = getCloudProjectVisibilityLabel(input.visibility, language);

  if (language === 'en') {
    return `Project: ${cleanedTitle} · Visibility: ${visibilityLabel}`;
  }

  return `프로젝트: ${cleanedTitle} · 공개 범위: ${visibilityLabel}`;
}

export function buildCloudProjectShareUrl(projectId: string) {
  if (typeof window === 'undefined') {
    return buildCloudProjectPath(projectId);
  }

  return new URL(buildCloudProjectPath(projectId), window.location.origin).toString();
}

export async function createCloudProject(input: {
  title: string;
  visibility: CloudProjectVisibility;
  stateJson: ModuMakeProjectData;
}) {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(input),
  });

  return parseActionResponse(response);
}

export async function fetchCloudProject(projectId: string, editToken?: string) {
  const response = await fetch(`/api/projects/${projectId}`, {
    method: 'GET',
    headers: buildHeaders(editToken),
  });

  return parseActionResponse(response);
}

export async function updateCloudProject(
  projectId: string,
  input: {
    title?: string;
    visibility?: CloudProjectVisibility;
    stateJson?: ModuMakeProjectData;
  },
  editToken?: string
) {
  const response = await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: buildHeaders(editToken),
    body: JSON.stringify(input),
  });

  return parseActionResponse(response);
}

export async function forkCloudProject(
  projectId: string,
  input: {
    title?: string;
  },
  editToken?: string
) {
  const response = await fetch(`/api/projects/${projectId}/fork`, {
    method: 'POST',
    headers: buildHeaders(editToken),
    body: JSON.stringify(input),
  });

  return parseActionResponse(response);
}
