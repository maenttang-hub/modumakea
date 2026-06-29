import type {
  CollaborationCursor,
  CollaborationParticipant,
  CollaborationSelection,
} from '@/types';

export const COLLABORATION_PRESENCE_EVENT = 'presence';
export const COLLABORATION_LEAVE_EVENT = 'leave';
export const COLLABORATION_SHARED_CODE_EVENT = 'shared-code';
export const COLLABORATION_CIRCUIT_PATCH_EVENT = 'circuit-patch';
export const COLLABORATION_STALE_MS = 15000;
export const COLLABORATION_HEARTBEAT_MS = 7000;

const COLLABORATOR_COLORS = [
  '#38bdf8',
  '#f472b6',
  '#a78bfa',
  '#34d399',
  '#f59e0b',
  '#fb7185',
  '#22c55e',
  '#60a5fa',
];

function toFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function buildCollaborationSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `session-${Math.random().toString(36).slice(2, 10)}`;
}

export function pickCollaboratorColor(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return COLLABORATOR_COLORS[hash % COLLABORATOR_COLORS.length] ?? '#38bdf8';
}

export function buildCollaborationDisplayName(sessionId: string, isOwner: boolean) {
  const shortId = sessionId.replace(/-/g, '').slice(-4).toUpperCase();
  return `${isOwner ? '편집자' : '참가자'} ${shortId}`;
}

export function sanitizeCollaborationParticipant(payload: unknown): CollaborationParticipant | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.sessionId !== 'string' || candidate.sessionId.trim().length === 0) {
    return null;
  }

  const updatedAt =
    toFiniteNumber(candidate.updatedAt) ??
    Date.now();
  const selectionSource =
    candidate.selection && typeof candidate.selection === 'object'
      ? candidate.selection as Record<string, unknown>
      : null;
  const selection: CollaborationSelection | undefined = selectionSource
    ? {
        componentId: typeof selectionSource.componentId === 'string' ? selectionSource.componentId : undefined,
        boardPin: typeof selectionSource.boardPin === 'string' ? selectionSource.boardPin : undefined,
        lineNumber: toFiniteNumber(selectionSource.lineNumber) ?? undefined,
        label: typeof selectionSource.label === 'string' ? selectionSource.label : undefined,
      }
    : undefined;
  const cursorSource =
    candidate.cursor && typeof candidate.cursor === 'object'
      ? candidate.cursor as Record<string, unknown>
      : null;
  const cursor: CollaborationCursor | undefined = cursorSource
    ? {
        x: toFiniteNumber(cursorSource.x) ?? undefined,
        y: toFiniteNumber(cursorSource.y) ?? undefined,
        lineNumber: toFiniteNumber(cursorSource.lineNumber) ?? undefined,
      }
    : undefined;

  return {
    sessionId: candidate.sessionId,
    userName:
      typeof candidate.userName === 'string' && candidate.userName.trim().length > 0
        ? candidate.userName
        : buildCollaborationDisplayName(candidate.sessionId, Boolean(candidate.isOwner)),
    color:
      typeof candidate.color === 'string' && candidate.color.trim().length > 0
        ? candidate.color
        : pickCollaboratorColor(candidate.sessionId),
    isOwner: Boolean(candidate.isOwner),
    scope:
      candidate.scope === 'canvas' ||
      candidate.scope === 'code' ||
      candidate.scope === 'review'
        ? candidate.scope
        : 'idle',
    updatedAt,
    selection:
      selection && (selection.componentId || selection.boardPin || selection.lineNumber)
        ? selection
        : undefined,
    cursor:
      cursor && (cursor.x !== undefined || cursor.y !== undefined || cursor.lineNumber !== undefined)
        ? cursor
        : undefined,
  };
}

export function isCollaborationParticipantStale(
  participant: CollaborationParticipant,
  now = Date.now(),
  ttlMs = COLLABORATION_STALE_MS
) {
  return now - participant.updatedAt > ttlMs;
}

export function summarizeCollaborationParticipant(participant: CollaborationParticipant) {
  if (participant.selection?.label) {
    return participant.selection.label;
  }

  if (participant.selection?.componentId) {
    return participant.selection.componentId;
  }

  if (participant.selection?.boardPin) {
    return participant.selection.boardPin;
  }

  if (participant.selection?.lineNumber) {
    return `코드 ${participant.selection.lineNumber}줄`;
  }

  if (participant.cursor?.lineNumber) {
    return `코드 ${participant.cursor.lineNumber}줄`;
  }

  return participant.scope === 'canvas'
    ? '캔버스 탐색 중'
    : participant.scope === 'code'
      ? '코드 확인 중'
      : participant.scope === 'review'
        ? '검토 중'
        : '대기 중';
}
