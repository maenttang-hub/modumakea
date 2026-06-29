import type { ProjectCommentTargetMeta, ProjectCommentTargetType } from '@/types';

export const COMMENT_FOCUS_EVENT = 'modumake:comment-focus';
export const COMMENT_PANEL_OPEN_EVENT = 'modumake:open-comments-panel';

export interface CommentFocusDetail {
  commentId: string;
  targetType: ProjectCommentTargetType;
  targetMeta: ProjectCommentTargetMeta;
}

export function emitCommentFocus(detail: CommentFocusDetail) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<CommentFocusDetail>(COMMENT_FOCUS_EVENT, {
    detail,
  }));
}

export function emitOpenCommentsPanel() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(COMMENT_PANEL_OPEN_EVENT));
}
