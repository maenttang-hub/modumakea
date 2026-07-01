import { getStoredCloudProject } from '@/lib/cloud-project-store';

export function getValidationEditToken(request: Request) {
  return request.headers.get('x-modumake-edit-token')?.trim() || undefined;
}

export async function authorizeProjectValidationRead(projectId: string, editToken?: string) {
  await getStoredCloudProject(projectId, editToken);
}

export async function authorizeProjectValidationWrite(projectId: string, editToken?: string) {
  const project = await getStoredCloudProject(projectId, editToken);
  if (!project.isOwner) {
    throw new Error('이 프로젝트의 validation snapshot을 저장할 권한이 없습니다.');
  }
}

export function getValidationAuthErrorStatus(message: string) {
  if (/권한/.test(message)) {
    return 403;
  }

  if (/찾지 못했습니다|not found/i.test(message)) {
    return 404;
  }

  if (/not configured/i.test(message)) {
    return 503;
  }

  return 500;
}
