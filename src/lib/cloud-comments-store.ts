import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { getStoredCloudProject } from '@/lib/cloud-project-store';
import type {
  ProjectCommentRecord,
  ProjectCommentStatus,
  ProjectCommentTargetMeta,
  ProjectCommentTargetType,
} from '@/types';

type CommentRow = {
  id: string;
  project_id: string;
  author_id: string | null;
  content: string;
  target_type: ProjectCommentTargetType;
  target_meta: ProjectCommentTargetMeta;
  status: ProjectCommentStatus;
  parent_id: string | null;
  created_at: string;
};

function getCommentsTable() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('클라우드 댓글 서버가 아직 설정되지 않았습니다. Supabase 환경 변수를 확인해 주세요.');
  }

  return supabase.from('comments');
}

function mapCommentRow(row: CommentRow): ProjectCommentRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    authorId: row.author_id,
    content: row.content,
    targetType: row.target_type,
    targetMeta: row.target_meta,
    status: row.status,
    parentId: row.parent_id,
    createdAt: row.created_at,
  };
}

export async function listStoredProjectComments(projectId: string, editToken?: string) {
  await getStoredCloudProject(projectId, editToken);

  const { data, error } = await getCommentsTable()
    .select('id,project_id,author_id,content,target_type,target_meta,status,parent_id,created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message || '프로젝트 댓글을 읽지 못했습니다.');
  }

  return (data ?? []).map(mapCommentRow);
}

export async function createStoredProjectComment(input: {
  projectId: string;
  content: string;
  targetType: ProjectCommentTargetType;
  targetMeta: ProjectCommentTargetMeta;
  parentId?: string | null;
  editToken?: string;
}) {
  await getStoredCloudProject(input.projectId, input.editToken);

  if (input.parentId) {
    const { data: parentRow, error: parentError } = await getCommentsTable()
      .select('id')
      .eq('project_id', input.projectId)
      .eq('id', input.parentId)
      .maybeSingle();

    if (parentError || !parentRow) {
      throw new Error('답글을 달 원본 피드백을 찾지 못했습니다.');
    }
  }

  const { data, error } = await getCommentsTable()
    .insert({
      project_id: input.projectId,
      content: input.content,
      target_type: input.targetType,
      target_meta: input.targetMeta,
      status: 'open',
      parent_id: input.parentId ?? null,
    })
    .select('id,project_id,author_id,content,target_type,target_meta,status,parent_id,created_at')
    .single<CommentRow>();

  if (error || !data) {
    throw new Error(error?.message ?? '피드백을 저장하지 못했습니다.');
  }

  return mapCommentRow(data);
}

export async function updateStoredProjectComment(input: {
  projectId: string;
  commentId: string;
  status?: ProjectCommentStatus;
  content?: string;
  editToken?: string;
}) {
  await getStoredCloudProject(input.projectId, input.editToken);

  const payload: Record<string, unknown> = {};
  if (typeof input.status === 'string') {
    payload.status = input.status;
  }
  if (typeof input.content === 'string') {
    payload.content = input.content;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('바꿀 피드백 내용이 없습니다.');
  }

  const { data, error } = await getCommentsTable()
    .update(payload)
    .eq('project_id', input.projectId)
    .eq('id', input.commentId)
    .select('id,project_id,author_id,content,target_type,target_meta,status,parent_id,created_at')
    .single<CommentRow>();

  if (error || !data) {
    throw new Error(error?.message ?? '피드백을 업데이트하지 못했습니다.');
  }

  return mapCommentRow(data);
}
