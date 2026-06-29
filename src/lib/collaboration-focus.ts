export const COLLABORATION_FOCUS_EVENT = 'modumake:collaboration-focus';

export interface CollaborationFocusDetail {
  sessionId: string;
  userName: string;
  componentInstanceId?: string;
  boardPin?: string;
  lineNumber?: number;
}

export function emitCollaborationFocus(detail: CollaborationFocusDetail) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<CollaborationFocusDetail>(COLLABORATION_FOCUS_EVENT, {
    detail,
  }));
}
