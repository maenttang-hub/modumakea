import type {
  AppLanguage,
  PlacedComponent,
  ProjectCommentRecord,
  ProjectCommentStatus,
  ProjectCommentTargetMeta,
  ProjectCommentTargetType,
  ProjectCommentThread,
} from '@/types';

const BOARD_NODE_ID = 'board-node';
const BOARD_COMMENT_ANCHOR = { x: 320, y: 78 };
const COMPONENT_COMMENT_OFFSET = { x: 108, y: -18 };

export function buildProjectCommentThreads(comments: ProjectCommentRecord[]) {
  const rootComments = comments
    .filter(comment => !comment.parentId)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

  const repliesByParent = comments.reduce<Map<string, ProjectCommentRecord[]>>((map, comment) => {
    if (!comment.parentId) {
      return map;
    }

    const existing = map.get(comment.parentId) ?? [];
    existing.push(comment);
    map.set(comment.parentId, existing);
    return map;
  }, new Map());

  return rootComments.map<ProjectCommentThread>(root => ({
    root,
    replies: (repliesByParent.get(root.id) ?? []).sort(
      (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
    ),
  }));
}

export function getCommentThreadId(comment: Pick<ProjectCommentRecord, 'id' | 'parentId'>) {
  return comment.parentId ?? comment.id;
}

export function getCodeCommentThreadLineNumber(
  threads: ProjectCommentThread[],
  threadId: string | null
) {
  if (!threadId) {
    return null;
  }

  const thread = threads.find(candidate => candidate.root.id === threadId);
  if (!thread || thread.root.targetType !== 'code_line' || !('lineNumber' in thread.root.targetMeta)) {
    return null;
  }

  return thread.root.targetMeta.lineNumber;
}

export function getCommentTargetLabel(
  targetType: ProjectCommentRecord['targetType'],
  targetMeta: ProjectCommentTargetMeta,
  components: PlacedComponent[],
  language: AppLanguage = 'ko'
) {
  if (targetType === 'code_line' && 'lineNumber' in targetMeta) {
    return language === 'ko'
      ? `코드 ${targetMeta.lineNumber}줄`
      : `Code line ${targetMeta.lineNumber}`;
  }

  if (targetType === 'node' && 'nodeId' in targetMeta) {
    if (targetMeta.nodeId === BOARD_NODE_ID) {
      return language === 'ko' ? '보드 본체' : 'Board';
    }

    const component = components.find(item => item.instanceId === targetMeta.nodeId);
    if (component) {
      return language === 'ko' ? `부품: ${component.name}` : `Part: ${component.name}`;
    }
    return language === 'ko' ? '삭제된 부품' : 'Deleted part';
  }

  if (targetType === 'wire') {
    return language === 'ko' ? '배선' : 'Wire';
  }

  return language === 'ko' ? '캔버스 위치' : 'Canvas spot';
}

export function buildCommentPreview(content: string, maxLength = 56) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function shouldUseInlineCommentComposer(
  draft:
    | {
        mode: 'new' | 'reply';
        targetType: ProjectCommentTargetType;
      }
    | null
) {
  return Boolean(draft && draft.mode === 'new' && draft.targetType !== 'code_line');
}

export function getCommentDraftPresentationMode(
  draft:
    | {
        mode: 'new' | 'reply';
        targetType: ProjectCommentTargetType;
      }
    | null
) {
  if (!draft) {
    return 'none' as const;
  }

  if (draft.mode !== 'new') {
    return 'panel' as const;
  }

  if (draft.targetType === 'code_line') {
    return 'code-inline' as const;
  }

  return 'canvas-inline' as const;
}

export function resolveCommentTargetAnchor(
  targetType: ProjectCommentTargetType,
  targetMeta: ProjectCommentTargetMeta,
  components: PlacedComponent[]
): { x: number; y: number } | null {
  if (targetType === 'canvas_coord' && 'x' in targetMeta && 'y' in targetMeta) {
    return { x: Number(targetMeta.x), y: Number(targetMeta.y) };
  }

  if (targetType === 'wire' && 'x' in targetMeta && 'y' in targetMeta) {
    return { x: Number(targetMeta.x ?? 0), y: Number(targetMeta.y ?? 0) };
  }

  if (targetType === 'node' && 'nodeId' in targetMeta) {
    if (targetMeta.nodeId === BOARD_NODE_ID) {
      return BOARD_COMMENT_ANCHOR;
    }

    const component = components.find(item => item.instanceId === targetMeta.nodeId);
    if (!component) {
      if ('x' in targetMeta && 'y' in targetMeta) {
        return {
          x: targetMeta.x ?? 0,
          y: targetMeta.y ?? 0,
        };
      }
      return null;
    }

    return {
      x: component.position.x + COMPONENT_COMMENT_OFFSET.x,
      y: component.position.y + COMPONENT_COMMENT_OFFSET.y,
    };
  }

  return null;
}

export function resolveCommentAnchor(
  comment: ProjectCommentRecord,
  components: PlacedComponent[]
) {
  return resolveCommentTargetAnchor(comment.targetType, comment.targetMeta, components);
}

export function sortCommentThreadsByStatus(threads: ProjectCommentThread[]) {
  const statusRank: Record<ProjectCommentStatus, number> = {
    open: 0,
    orphaned: 1,
    resolved: 2,
  };

  return [...threads].sort((left, right) => {
    const statusDelta = statusRank[left.root.status] - statusRank[right.root.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }

    return Date.parse(right.root.createdAt) - Date.parse(left.root.createdAt);
  });
}
