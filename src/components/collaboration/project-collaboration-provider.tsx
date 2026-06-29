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
import { useBoardStore } from '@/store/use-board-store';
import {
  applyHistoryPatch,
  buildCircuitHistoryPatch,
  buildHistoryFlags,
} from '@/store/board-history';
import {
  createModuMakeCollaborationDocument,
  type CircuitPatchEnvelope,
  type CircuitPatchSnapshot,
  type SharedCodeSnapshot,
  type SharedCodeUpdateSource,
} from '@/lib/collaboration-doc';
import { getSupabaseClient } from '@/lib/supabase';
import { emitCollaborationFocus } from '@/lib/collaboration-focus';
import {
  COLLABORATION_CIRCUIT_PATCH_EVENT,
  buildCollaborationDisplayName,
  buildCollaborationSessionId,
  COLLABORATION_HEARTBEAT_MS,
  COLLABORATION_LEAVE_EVENT,
  COLLABORATION_PRESENCE_EVENT,
  COLLABORATION_SHARED_CODE_EVENT,
  COLLABORATION_STALE_MS,
  isCollaborationParticipantStale,
  pickCollaboratorColor,
  sanitizeCollaborationParticipant,
} from '@/lib/collaboration';
import { emitReviewFocus } from '@/lib/review-focus';
import type {
  CollaborationCursor,
  CollaborationParticipant,
  CollaborationSelection,
} from '@/types';

type CollaborationPresencePatch = {
  scope?: CollaborationParticipant['scope'];
  selection?: CollaborationSelection | null;
  cursor?: CollaborationCursor | null;
};

async function sendRealtimeBroadcast(
  channel: {
    httpSend: (event: string, payload: unknown) => Promise<unknown>;
    send: (payload: {
      type: 'broadcast';
      event: string;
      payload: unknown;
    }) => Promise<unknown>;
  },
  event: string,
  payload: unknown
) {
  try {
    await channel.httpSend(event, payload);
  } catch {
    await channel.send({
      type: 'broadcast',
      event,
      payload,
    }).catch(() => undefined);
  }
}

type ProjectCollaborationContextValue = {
  enabled: boolean;
  isConnected: boolean;
  sessionId: string;
  me: CollaborationParticipant | null;
  participants: CollaborationParticipant[];
  sharedDocEngine: 'disabled' | 'structured-local' | 'yjs';
  sharedCodeVersion: number;
  sharedCircuitVersion: number;
  updatePresence: (patch: CollaborationPresencePatch) => void;
  getSharedCode: () => string;
  setSharedCode: (text: string, source?: SharedCodeUpdateSource) => void;
  subscribeSharedCode: (listener: (snapshot: SharedCodeSnapshot) => void) => () => void;
  getLatestCircuitPatch: () => CircuitPatchSnapshot;
  publishCircuitPatch: (patch: CircuitPatchEnvelope) => void;
  subscribeCircuitPatches: (listener: (snapshot: CircuitPatchSnapshot) => void) => () => void;
  focusParticipant: (sessionId: string) => void;
};

const ProjectCollaborationContext = createContext<ProjectCollaborationContextValue | null>(null);

function mergePresence(
  current: CollaborationParticipant,
  patch: CollaborationPresencePatch
): CollaborationParticipant {
  return {
    ...current,
    scope: patch.scope ?? current.scope,
    updatedAt: Date.now(),
    selection:
      patch.selection === null
        ? undefined
        : patch.selection === undefined
          ? current.selection
          : patch.selection,
    cursor:
      patch.cursor === null
        ? undefined
        : patch.cursor === undefined
          ? current.cursor
          : patch.cursor,
  };
}

export function ProjectCollaborationProvider({ children }: { children: ReactNode }) {
  const projectId = useBoardStore(state => state.cloudProjectId);
  const cloudIsOwner = useBoardStore(state => state.cloudIsOwner);
  const components = useBoardStore(state => state.components);
  const manualConnections = useBoardStore(state => state.manualConnections);
  const generatedCode = useBoardStore(state => state.generatedCode);
  const historySignature = useBoardStore(state => state.historySignature);
  const [sessionId] = useState(() => buildCollaborationSessionId());
  const [me, setMe] = useState<CollaborationParticipant>({
    sessionId,
    userName: buildCollaborationDisplayName(sessionId, cloudIsOwner),
    color: pickCollaboratorColor(sessionId),
    isOwner: cloudIsOwner,
    scope: 'idle',
    updatedAt: 0,
  });
  const [participants, setParticipants] = useState<CollaborationParticipant[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [sharedDocEngine, setSharedDocEngine] = useState<'disabled' | 'structured-local' | 'yjs'>('disabled');
  const [sharedCodeVersion, setSharedCodeVersion] = useState(0);
  const [sharedCircuitVersion, setSharedCircuitVersion] = useState(0);
  const supabase = getSupabaseClient();
  const enabled = Boolean(projectId && supabase);
  const meRef = useRef<CollaborationParticipant>({
    sessionId,
    userName: buildCollaborationDisplayName(sessionId, cloudIsOwner),
    color: pickCollaboratorColor(sessionId),
    isOwner: cloudIsOwner,
    scope: 'idle',
    updatedAt: 0,
  });
  const collaborationDocRef = useRef<ReturnType<typeof createModuMakeCollaborationDocument> | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const participantsRef = useRef<Map<string, CollaborationParticipant>>(new Map());
  const lastPublishedCircuitStateRef = useRef<{
    projectId: string;
    components: typeof components;
    manualConnections: typeof manualConnections;
    historySignature: string;
  } | null>(null);
  const flushTimeoutRef = useRef<number | null>(null);
  const lastPresenceSentAtRef = useRef(0);

  useEffect(() => {
    const next = {
      ...meRef.current,
      userName: buildCollaborationDisplayName(sessionId, cloudIsOwner),
      isOwner: cloudIsOwner,
      updatedAt: Date.now(),
    };
    meRef.current = next;
    setMe(next);
  }, [cloudIsOwner, sessionId]);

  const syncParticipants = useCallback(() => {
    const now = Date.now();
    for (const [key, participant] of participantsRef.current.entries()) {
      if (isCollaborationParticipantStale(participant, now, COLLABORATION_STALE_MS)) {
        participantsRef.current.delete(key);
      }
    }

    setParticipants(
      [...participantsRef.current.values()]
        .sort((left, right) => right.updatedAt - left.updatedAt)
    );
  }, []);

  const sendPresenceNow = useCallback(async () => {
    if (!channelRef.current || !enabled) {
      return;
    }

    lastPresenceSentAtRef.current = Date.now();
    const next = {
      ...meRef.current,
      updatedAt: lastPresenceSentAtRef.current,
    };
    meRef.current = next;
    setMe(next);

    await sendRealtimeBroadcast(channelRef.current, COLLABORATION_PRESENCE_EVENT, next);
  }, [enabled]);

  const schedulePresenceFlush = useCallback(() => {
    if (!enabled) {
      return;
    }

    const now = Date.now();
    const delta = now - lastPresenceSentAtRef.current;
    if (delta >= 120) {
      void sendPresenceNow();
      return;
    }

    if (flushTimeoutRef.current !== null) {
      return;
    }

    flushTimeoutRef.current = window.setTimeout(() => {
      flushTimeoutRef.current = null;
      void sendPresenceNow();
    }, 120 - delta);
  }, [enabled, sendPresenceNow]);

  const updatePresence = useCallback((patch: CollaborationPresencePatch) => {
    const next = mergePresence(meRef.current, patch);
    meRef.current = next;
    setMe(next);
    schedulePresenceFlush();
  }, [schedulePresenceFlush]);

  const focusParticipant = useCallback((targetSessionId: string) => {
    const participant = participantsRef.current.get(targetSessionId);
    if (!participant) {
      return;
    }

    if (participant.selection?.componentId) {
      window.dispatchEvent(new CustomEvent('modumake:focus-component', {
        detail: { instanceId: participant.selection.componentId },
      }));
    } else if (participant.selection?.boardPin) {
      emitReviewFocus({
        source: 'review',
        boardPin: participant.selection.boardPin,
        severity: 'info',
        title: `${participant.userName} 위치`,
        message: participant.selection.label ?? participant.selection.boardPin,
      });
    }

    const lineNumber = participant.selection?.lineNumber ?? participant.cursor?.lineNumber;
    if (lineNumber) {
      emitCollaborationFocus({
        sessionId: participant.sessionId,
        userName: participant.userName,
        componentInstanceId: participant.selection?.componentId,
        boardPin: participant.selection?.boardPin,
        lineNumber,
      });
    }
  }, []);

  useEffect(() => {
    if (!projectId) {
      collaborationDocRef.current?.destroy();
      collaborationDocRef.current = null;
      lastPublishedCircuitStateRef.current = null;
      const frame = window.requestAnimationFrame(() => {
        setSharedDocEngine('disabled');
        setSharedCodeVersion(0);
        setSharedCircuitVersion(0);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (collaborationDocRef.current?.projectId !== projectId) {
      collaborationDocRef.current?.destroy();
      collaborationDocRef.current = createModuMakeCollaborationDocument(projectId);
    }

    const nextDoc = collaborationDocRef.current;
    const frame = window.requestAnimationFrame(() => {
      setSharedDocEngine(nextDoc?.engine ?? 'structured-local');
    });
    lastPublishedCircuitStateRef.current = {
      projectId,
      components,
      manualConnections,
      historySignature,
    };

    if (generatedCode.trim()) {
      const snapshot = nextDoc.code.setText(generatedCode, {
        originSessionId: sessionId,
        source: 'seed',
      });
      window.requestAnimationFrame(() => {
        setSharedCodeVersion(snapshot.version);
        setSharedCircuitVersion(nextDoc.circuit.getSnapshot().version);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    const versionSnapshot = nextDoc.code.getSnapshot().version;
    const circuitVersionSnapshot = nextDoc.circuit.getSnapshot().version;
    window.requestAnimationFrame(() => {
      setSharedCodeVersion(versionSnapshot);
      setSharedCircuitVersion(circuitVersionSnapshot);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [components, generatedCode, historySignature, manualConnections, projectId, sessionId]);

  const getSharedCode = useCallback(() => {
    return collaborationDocRef.current?.code.getSnapshot().text ?? '';
  }, []);

  const setSharedCode = useCallback((text: string, source: SharedCodeUpdateSource = 'store') => {
    const doc = collaborationDocRef.current;
    if (!doc) {
      return;
    }

    const snapshot = doc.code.setText(text, {
      originSessionId: sessionId,
      source,
    });
    setSharedCodeVersion(snapshot.version);
  }, [sessionId]);

  const subscribeSharedCode = useCallback((listener: (snapshot: SharedCodeSnapshot) => void) => {
    const doc = collaborationDocRef.current;
    if (!doc) {
      return () => undefined;
    }

    return doc.code.observe(snapshot => {
      setSharedCodeVersion(snapshot.version);
      listener(snapshot);
    });
  }, []);

  const getLatestCircuitPatch = useCallback(() => {
    return collaborationDocRef.current?.circuit.getSnapshot() ?? {
      patch: null,
      version: 0,
      engine: 'structured-local',
      originSessionId: null,
      source: 'seed',
    };
  }, []);

  const publishCircuitPatch = useCallback((patch: CircuitPatchEnvelope) => {
    const doc = collaborationDocRef.current;
    if (!doc) {
      return;
    }

    const snapshot = doc.circuit.publishPatch(patch, {
      originSessionId: sessionId,
      source: patch.source ?? 'manual',
    });
    setSharedCircuitVersion(snapshot.version);
  }, [sessionId]);

  const subscribeCircuitPatches = useCallback((listener: (snapshot: CircuitPatchSnapshot) => void) => {
    const doc = collaborationDocRef.current;
    if (!doc) {
      return () => undefined;
    }

    return doc.circuit.observe(snapshot => {
      setSharedCircuitVersion(snapshot.version);
      listener(snapshot);
    });
  }, []);

  useEffect(() => {
    if (!projectId) {
      lastPublishedCircuitStateRef.current = null;
      return;
    }

    const previousState = lastPublishedCircuitStateRef.current;
    const nextState = {
      projectId,
      components,
      manualConnections,
      historySignature,
    };

    if (!previousState || previousState.projectId !== projectId) {
      lastPublishedCircuitStateRef.current = nextState;
      return;
    }

    const patch = buildCircuitHistoryPatch({
      previous: {
        components: previousState.components,
        manualConnections: previousState.manualConnections,
      },
      next: {
        components,
        manualConnections,
      },
    });
    lastPublishedCircuitStateRef.current = nextState;

    if (!patch) {
      return;
    }

    const snapshot = collaborationDocRef.current?.circuit.publishPatch({
      ...patch,
      baseSignature: previousState.historySignature,
      nextSignature: historySignature,
      source: 'history',
    }, {
      originSessionId: sessionId,
      source: 'history',
    });

    if (snapshot) {
      setSharedCircuitVersion(snapshot.version);
    }
  }, [components, historySignature, manualConnections, projectId, sessionId]);

  useEffect(() => {
    if (!enabled || !isConnected) {
      return;
    }

    const doc = collaborationDocRef.current;
    const channel = channelRef.current;
    if (!doc || !channel) {
      return;
    }

    return doc.code.observe(snapshot => {
      setSharedCodeVersion(snapshot.version);
      if (snapshot.source === 'remote' || snapshot.originSessionId !== sessionId) {
        return;
      }

      const nonce = `${sessionId}:code:${snapshot.version}`;
      void sendRealtimeBroadcast(channel, COLLABORATION_SHARED_CODE_EVENT, {
        nonce,
        text: snapshot.text,
        originSessionId: snapshot.originSessionId,
        source: snapshot.source,
      });
    });
  }, [enabled, isConnected, sessionId]);

  useEffect(() => {
    if (!enabled || !isConnected) {
      return;
    }

    const doc = collaborationDocRef.current;
    const channel = channelRef.current;
    if (!doc || !channel) {
      return;
    }

    return doc.circuit.observe(snapshot => {
      setSharedCircuitVersion(snapshot.version);
      if (!snapshot.patch || snapshot.source === 'remote' || snapshot.originSessionId !== sessionId) {
        return;
      }

      const nonce = `${sessionId}:circuit:${snapshot.version}`;
      void sendRealtimeBroadcast(channel, COLLABORATION_CIRCUIT_PATCH_EVENT, {
        nonce,
        patch: snapshot.patch,
        originSessionId: snapshot.originSessionId,
        source: snapshot.source,
      });
    });
  }, [enabled, isConnected, sessionId]);

  useEffect(() => {
    if (!enabled || !projectId || !supabase) {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
      participantsRef.current.clear();
      Promise.resolve().then(() => {
        setParticipants([]);
        setIsConnected(false);
      });
      return;
    }

    const channel = supabase.channel(`modumake-collab:${projectId}`, {
      config: {
        broadcast: { self: false },
      },
    });
    const participantMap = participantsRef.current;
    channelRef.current = channel;

    channel
      .on('broadcast', { event: COLLABORATION_PRESENCE_EVENT }, message => {
        const participant = sanitizeCollaborationParticipant(message.payload);
        if (!participant || participant.sessionId === sessionId) {
          return;
        }

        participantMap.set(participant.sessionId, participant);
        syncParticipants();
      })
      .on('broadcast', { event: COLLABORATION_LEAVE_EVENT }, message => {
        const leavingSessionId =
          message.payload && typeof message.payload === 'object' && typeof (message.payload as Record<string, unknown>).sessionId === 'string'
            ? (message.payload as Record<string, string>).sessionId
            : null;
        if (!leavingSessionId) {
          return;
        }

        participantMap.delete(leavingSessionId);
        syncParticipants();
      })
      .on('broadcast', { event: COLLABORATION_SHARED_CODE_EVENT }, message => {
        const payload =
          message.payload && typeof message.payload === 'object'
            ? message.payload as Record<string, unknown>
            : null;
        const text = typeof payload?.text === 'string' ? payload.text : null;
        if (text == null) {
          return;
        }

        collaborationDocRef.current?.code.setText(text, {
          originSessionId:
            typeof payload?.originSessionId === 'string'
              ? payload.originSessionId
              : null,
          source: 'remote',
        });
      })
      .on('broadcast', { event: COLLABORATION_CIRCUIT_PATCH_EVENT }, message => {
        const payload =
          message.payload && typeof message.payload === 'object'
            ? message.payload as Record<string, unknown>
            : null;
        const rawPatch =
          payload?.patch && typeof payload.patch === 'object'
            ? payload.patch as Record<string, unknown>
            : null;
        if (!rawPatch) {
          return;
        }

        const patch = rawPatch as CircuitPatchEnvelope;

        const circuitSnapshot = collaborationDocRef.current?.circuit.publishPatch(patch, {
          originSessionId:
            typeof payload?.originSessionId === 'string'
              ? payload.originSessionId
              : null,
          source: 'remote',
        });
        if (circuitSnapshot?.patch) {
          useBoardStore.setState(current => {
            const applied = applyHistoryPatch(current, {
              components: circuitSnapshot.patch?.components,
              manualConnections: circuitSnapshot.patch?.manualConnections,
            });
            const nextHistorySignature = circuitSnapshot.patch?.nextSignature ?? current.historySignature;
            lastPublishedCircuitStateRef.current = {
              projectId,
              components: applied.components,
              manualConnections: applied.manualConnections,
              historySignature: nextHistorySignature,
            };

            return {
              ...applied,
              pastHistoryEntries: [],
              futureHistoryEntries: [],
              historySignature: nextHistorySignature,
              ...buildHistoryFlags([], []),
            };
          });
        }
      })
      .subscribe(status => {
        setIsConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') {
          void sendPresenceNow();
        }
      });

    const heartbeat = window.setInterval(() => {
      void sendPresenceNow();
      syncParticipants();
    }, COLLABORATION_HEARTBEAT_MS);

    const staleSweep = window.setInterval(() => {
      syncParticipants();
    }, 4000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void sendPresenceNow();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(heartbeat);
      window.clearInterval(staleSweep);
      if (flushTimeoutRef.current !== null) {
        window.clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      void sendRealtimeBroadcast(channel, COLLABORATION_LEAVE_EVENT, { sessionId });
      channel.unsubscribe();
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
      participantMap.clear();
      setParticipants([]);
      setIsConnected(false);
    };
  }, [enabled, projectId, sendPresenceNow, sessionId, supabase, syncParticipants]);

  const value = useMemo<ProjectCollaborationContextValue>(() => ({
    enabled,
    isConnected,
    sessionId,
    me: enabled ? me : null,
    participants,
    sharedDocEngine,
    sharedCodeVersion,
    sharedCircuitVersion,
    updatePresence,
    getSharedCode,
    setSharedCode,
    subscribeSharedCode,
    getLatestCircuitPatch,
    publishCircuitPatch,
    subscribeCircuitPatches,
    focusParticipant,
  }), [
    enabled,
    focusParticipant,
    getLatestCircuitPatch,
    getSharedCode,
    isConnected,
    me,
    participants,
    publishCircuitPatch,
    sessionId,
    setSharedCode,
    sharedCircuitVersion,
    sharedDocEngine,
    sharedCodeVersion,
    subscribeCircuitPatches,
    subscribeSharedCode,
    updatePresence,
  ]);

  return (
    <ProjectCollaborationContext.Provider value={value}>
      {children}
    </ProjectCollaborationContext.Provider>
  );
}

export function useProjectCollaboration() {
  const context = useContext(ProjectCollaborationContext);
  if (!context) {
    throw new Error('useProjectCollaboration must be used within ProjectCollaborationProvider.');
  }

  return context;
}
