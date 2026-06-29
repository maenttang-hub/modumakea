import type {
  ProjectCommentRecord,
  ProjectCommentStatus,
  ProjectCommentTargetMeta,
  ProjectCommentTargetType,
} from '@/types';

function buildHeaders(editToken?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (editToken) {
    headers['x-modumake-edit-token'] = editToken;
  }

  return headers;
}

type ProjectCommentsResult =
  | { success: true; comments: ProjectCommentRecord[] }
  | { success: false; error: string };

type ProjectCommentActionResult =
  | { success: true; comment: ProjectCommentRecord }
  | { success: false; error: string };

async function parseListResponse(response: Response): Promise<ProjectCommentsResult> {
  const payload = await response.json().catch(() => null) as
    | { comments?: ProjectCommentRecord[]; error?: string }
    | null;

  if (!response.ok || !payload?.comments) {
    return {
      success: false,
      error: payload?.error ?? '피드백 목록을 불러오지 못했습니다.',
    };
  }

  return {
    success: true,
    comments: payload.comments,
  };
}

async function parseActionResponse(response: Response): Promise<ProjectCommentActionResult> {
  const payload = await response.json().catch(() => null) as
    | { comment?: ProjectCommentRecord; error?: string }
    | null;

  if (!response.ok || !payload?.comment) {
    return {
      success: false,
      error: payload?.error ?? '피드백 요청이 실패했습니다.',
    };
  }

  return {
    success: true,
    comment: payload.comment,
  };
}

export async function fetchProjectComments(projectId: string, editToken?: string) {
  const response = await fetch(`/api/projects/${projectId}/comments`, {
    method: 'GET',
    headers: buildHeaders(editToken),
  });

  return parseListResponse(response);
}

export async function createProjectComment(
  projectId: string,
  input: {
    content: string;
    targetType: ProjectCommentTargetType;
    targetMeta: ProjectCommentTargetMeta;
    parentId?: string | null;
  },
  editToken?: string
) {
  const response = await fetch(`/api/projects/${projectId}/comments`, {
    method: 'POST',
    headers: buildHeaders(editToken),
    body: JSON.stringify(input),
  });

  return parseActionResponse(response);
}

export async function updateProjectComment(
  projectId: string,
  commentId: string,
  input: {
    status?: ProjectCommentStatus;
    content?: string;
  },
  editToken?: string
) {
  const response = await fetch(`/api/projects/${projectId}/comments/${commentId}`, {
    method: 'PATCH',
    headers: buildHeaders(editToken),
    body: JSON.stringify(input),
  });

  return parseActionResponse(response);
}
