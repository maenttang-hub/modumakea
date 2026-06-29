'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { useBoardStore } from '@/store/use-board-store';
import {
  createProjectComment,
  fetchProjectComments,
  updateProjectComment,
} from '@/lib/cloud-comments';
import { emitCommentFocus, emitOpenCommentsPanel } from '@/lib/comment-focus';
import {
  buildProjectCommentThreads,
  getCommentThreadId,
  sortCommentThreadsByStatus,
} from '@/lib/project-comments';
import type {
  ProjectCommentRecord,
  ProjectCommentStatus,
  ProjectCommentTargetMeta,
  ProjectCommentTargetType,
  ProjectCommentThread,
} from '@/types';

export type CommentDraft =
  | {
      mode: 'new';
      targetType: ProjectCommentTargetType;
      targetMeta: ProjectCommentTargetMeta;
      parentId: null;
    }
  | {
      mode: 'reply';
      targetType: ProjectCommentTargetType;
      targetMeta: ProjectCommentTargetMeta;
      parentId: string;
    };

type ProjectCommentsContextValue = {
  enabled: boolean;
  projectId: string | null;
  isLoading: boolean;
  error: string | null;
  commentMode: boolean;
  setCommentMode: (enabled: boolean) => void;
  toggleCommentMode: () => void;
  comments: ProjectCommentRecord[];
  threads: ProjectCommentThread[];
  openThreads: ProjectCommentThread[];
  selectedCommentId: string | null;
  highlightedThreadId: string | null;
  highlightedCommentId: string | null;
  setPollingActive: (active: boolean) => void;
  draft: CommentDraft | null;
  refresh: () => Promise<void>;
  startCommentDraft: (targetType: ProjectCommentTargetType, targetMeta: ProjectCommentTargetMeta) => void;
  startReplyDraft: (thread: ProjectCommentThread) => void;
  cancelDraft: () => void;
  submitDraft: (content: string) => Promise<{ success: boolean }>;
  setCommentStatus: (commentId: string, status: ProjectCommentStatus) => Promise<{ success: boolean }>;
  focusComment: (comment: ProjectCommentRecord) => void;
  selectComment: (commentId: string | null) => void;
};

const ProjectCommentsContext = createContext<ProjectCommentsContextValue | null>(null);

export function ProjectCommentsProvider({ children }: { children: ReactNode }) {
  const projectId = useBoardStore(state => state.cloudProjectId);
  const editToken = useBoardStore(state => state.cloudEditToken);
  const enabled = Boolean(projectId);
  const [comments, setComments] = useState<ProjectCommentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentMode, setCommentMode] = useState(false);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [highlightedThreadId, setHighlightedThreadId] = useState<string | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  const [draft, setDraft] = useState<CommentDraft | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);

  const pulseSavedComment = useCallback((threadId: string, commentId: string) => {
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    setHighlightedThreadId(threadId);
    setHighlightedCommentId(commentId);
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedThreadId(current => (current === threadId ? null : current));
      setHighlightedCommentId(current => (current === commentId ? null : current));
      highlightTimeoutRef.current = null;
    }, 1800);
  }, []);

  const loadComments = useCallback(async (
    nextProjectId: string,
    nextEditToken?: string | null,
    canCommit: () => boolean = () => true
  ) => {
    if (!canCommit()) {
      return;
    }
    setIsLoading(true);
    const result = await fetchProjectComments(nextProjectId, nextEditToken ?? undefined);
    if (!canCommit()) {
      return;
    }
    setIsLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setComments(result.comments);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setComments([]);
      setError(null);
      setSelectedCommentId(null);
      setHighlightedThreadId(null);
      setHighlightedCommentId(null);
      return;
    }

    await loadComments(projectId, editToken);
  }, [editToken, loadComments, projectId]);

  useEffect(() => {
    let active = true;

    if (!projectId) {
      Promise.resolve().then(() => {
        if (!active) {
          return;
        }
        setComments([]);
        setError(null);
        setSelectedCommentId(null);
        setHighlightedThreadId(null);
        setHighlightedCommentId(null);
        setCommentMode(false);
        setDraft(null);
      });

      return () => {
        active = false;
      };
    }

    const kickoff = window.setTimeout(() => {
      void loadComments(projectId, editToken, () => active);
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(kickoff);
    };
  }, [editToken, loadComments, projectId]);

  useEffect(() => {
    let active = true;

    if (!projectId || !pollingActive) {
      return () => {
        active = false;
      };
    }

    const kickoff = window.setTimeout(() => {
      void loadComments(projectId, editToken, () => active);
    }, 0);

    const interval = window.setInterval(() => {
      void loadComments(projectId, editToken, () => active);
    }, 4500);

    return () => {
      active = false;
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, [editToken, loadComments, pollingActive, projectId]);

  const threads = useMemo(
    () => sortCommentThreadsByStatus(buildProjectCommentThreads(comments)),
    [comments]
  );

  const openThreads = useMemo(
    () => threads.filter(thread => thread.root.status === 'open'),
    [threads]
  );

  const focusComment = useCallback((comment: ProjectCommentRecord) => {
    setSelectedCommentId(getCommentThreadId(comment));
    emitOpenCommentsPanel();
    emitCommentFocus({
      commentId: comment.id,
      targetType: comment.targetType,
      targetMeta: comment.targetMeta,
    });
  }, []);

  const ensureEnabled = useCallback(() => {
    if (projectId) {
      return true;
    }

    toast.info('피드백은 링크 프로젝트에서 함께 씁니다.', {
      description: '먼저 클라우드 공유를 시작하면 캔버스와 코드 줄에 댓글을 남길 수 있습니다.',
    });
    return false;
  }, [projectId]);

  const startCommentDraft = useCallback((
    targetType: ProjectCommentTargetType,
    targetMeta: ProjectCommentTargetMeta
  ) => {
    if (!ensureEnabled()) {
      return;
    }

    setDraft({
      mode: 'new',
      targetType,
      targetMeta,
      parentId: null,
    });
    setCommentMode(true);
    emitOpenCommentsPanel();
  }, [ensureEnabled]);

  const startReplyDraft = useCallback((thread: ProjectCommentThread) => {
    if (!ensureEnabled()) {
      return;
    }

    setDraft({
      mode: 'reply',
      targetType: thread.root.targetType,
      targetMeta: thread.root.targetMeta,
      parentId: thread.root.id,
    });
    setSelectedCommentId(thread.root.id);
    emitOpenCommentsPanel();
  }, [ensureEnabled]);

  const cancelDraft = useCallback(() => setDraft(null), []);

  const submitDraft = useCallback(async (content: string) => {
    if (!projectId || !draft) {
      return { success: false };
    }

    const result = await createProjectComment(projectId, {
      content,
      targetType: draft.targetType,
      targetMeta: draft.targetMeta,
      parentId: draft.parentId,
    }, editToken ?? undefined);

    if (!result.success) {
      toast.error('피드백을 저장하지 못했습니다.', {
        description: result.error,
      });
      return { success: false };
    }

    setComments(current => [...current, result.comment]);
    const threadId = draft.parentId ?? result.comment.id;
    pulseSavedComment(threadId, result.comment.id);
    focusComment(result.comment);
    setDraft(null);
    setCommentMode(false);
    toast.success(draft.mode === 'reply' ? '답글을 남겼습니다.' : '피드백 핀을 꽂았습니다.');
    return { success: true };
  }, [draft, editToken, focusComment, projectId, pulseSavedComment]);

  const setCommentStatus = useCallback(async (commentId: string, status: ProjectCommentStatus) => {
    if (!projectId) {
      return { success: false };
    }

    const result = await updateProjectComment(projectId, commentId, { status }, editToken ?? undefined);
    if (!result.success) {
      toast.error('피드백 상태를 바꾸지 못했습니다.', {
        description: result.error,
      });
      return { success: false };
    }

    setComments(current =>
      current.map(comment => (comment.id === commentId ? result.comment : comment))
    );
    toast.success(status === 'resolved' ? '피드백을 해결 처리했습니다.' : '피드백을 다시 열었습니다.');
    return { success: true };
  }, [editToken, projectId]);

  const toggleCommentMode = useCallback(() => {
    if (!commentMode && !ensureEnabled()) {
      return;
    }

    setCommentMode(current => {
      const next = !current;
      if (next) {
        emitOpenCommentsPanel();
      } else {
        setDraft(null);
      }
      return next;
    });
  }, [commentMode, ensureEnabled]);

  const value = useMemo<ProjectCommentsContextValue>(() => ({
    enabled,
    projectId,
    isLoading,
    error,
    commentMode,
    setCommentMode,
    toggleCommentMode,
    comments,
    threads,
    openThreads,
    selectedCommentId,
    highlightedThreadId,
    highlightedCommentId,
    setPollingActive,
    draft,
    refresh,
    startCommentDraft,
    startReplyDraft,
    cancelDraft,
    submitDraft,
    setCommentStatus,
    focusComment,
    selectComment: setSelectedCommentId,
  }), [
    commentMode,
    comments,
    draft,
    enabled,
    error,
    focusComment,
    isLoading,
    openThreads,
    projectId,
    refresh,
    selectedCommentId,
    highlightedThreadId,
    highlightedCommentId,
    setCommentStatus,
    startCommentDraft,
    startReplyDraft,
    cancelDraft,
    submitDraft,
    threads,
    toggleCommentMode,
  ]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  return (
    <ProjectCommentsContext.Provider value={value}>
      {children}
    </ProjectCommentsContext.Provider>
  );
}

export function useProjectComments() {
  const context = useContext(ProjectCommentsContext);
  if (!context) {
    throw new Error('useProjectComments must be used within ProjectCommentsProvider.');
  }

  return context;
}
