import { loadGeneratedYjsCollaborationDocumentFactory } from '@/generated/yjs-collaboration';
import type { CircuitHistoryPatch } from '@/store/board-history';

export type CollaborationDocEngine = 'structured-local' | 'yjs';
export type SharedCodeUpdateSource = 'seed' | 'editor' | 'store' | 'remote';
export type CircuitPatchUpdateSource = 'seed' | 'history' | 'manual' | 'remote';

export interface SharedCodeSnapshot {
  text: string;
  version: number;
  engine: CollaborationDocEngine;
  originSessionId: string | null;
  source: SharedCodeUpdateSource;
}

export interface CircuitPatchEnvelope extends CircuitHistoryPatch {
  baseSignature?: string;
  nextSignature?: string;
  source?: CircuitPatchUpdateSource;
}

export interface CircuitPatchSnapshot {
  patch: CircuitPatchEnvelope | null;
  version: number;
  engine: CollaborationDocEngine;
  originSessionId: string | null;
  source: CircuitPatchUpdateSource;
}

type SharedCodeListener = (snapshot: SharedCodeSnapshot) => void;
type CircuitPatchListener = (snapshot: CircuitPatchSnapshot) => void;

export interface CollaborationTextDocument {
  readonly engine: CollaborationDocEngine;
  getSnapshot: () => SharedCodeSnapshot;
  setText: (text: string, options?: { originSessionId?: string | null; source?: SharedCodeUpdateSource }) => SharedCodeSnapshot;
  observe: (listener: SharedCodeListener) => () => void;
  destroy: () => void;
}

export interface CollaborationCircuitDocument {
  readonly engine: CollaborationDocEngine;
  getSnapshot: () => CircuitPatchSnapshot;
  publishPatch: (
    patch: CircuitPatchEnvelope,
    options?: { originSessionId?: string | null; source?: CircuitPatchUpdateSource }
  ) => CircuitPatchSnapshot;
  observe: (listener: CircuitPatchListener) => () => void;
  destroy: () => void;
}

export interface ModuMakeCollaborationDocument {
  engine: CollaborationDocEngine;
  projectId: string;
  code: CollaborationTextDocument;
  circuit: CollaborationCircuitDocument;
  destroy: () => void;
}

function serializeCircuitPatchEnvelope(patch: CircuitPatchEnvelope | null) {
  if (!patch) {
    return '';
  }

  return JSON.stringify({
    components: patch.components ?? null,
    manualConnections: patch.manualConnections ?? null,
    baseSignature: patch.baseSignature ?? null,
    nextSignature: patch.nextSignature ?? null,
    source: patch.source ?? null,
  });
}

class LocalCollaborationTextDocument implements CollaborationTextDocument {
  readonly engine: CollaborationDocEngine = 'structured-local';

  private text = '';
  private version = 0;
  private lastOriginSessionId: string | null = null;
  private lastSource: SharedCodeUpdateSource = 'seed';
  private listeners = new Set<SharedCodeListener>();

  getSnapshot(): SharedCodeSnapshot {
    return {
      text: this.text,
      version: this.version,
      engine: this.engine,
      originSessionId: this.lastOriginSessionId,
      source: this.lastSource,
    };
  }

  setText(
    text: string,
    options?: { originSessionId?: string | null; source?: SharedCodeUpdateSource }
  ): SharedCodeSnapshot {
    if (text === this.text) {
      return this.getSnapshot();
    }

    this.text = text;
    this.version += 1;
    this.lastOriginSessionId = options?.originSessionId ?? null;
    this.lastSource = options?.source ?? 'store';

    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }

    return snapshot;
  }

  observe(listener: SharedCodeListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy() {
    this.listeners.clear();
  }
}

class LocalCollaborationCircuitDocument implements CollaborationCircuitDocument {
  readonly engine: CollaborationDocEngine = 'structured-local';

  private patch: CircuitPatchEnvelope | null = null;
  private version = 0;
  private lastOriginSessionId: string | null = null;
  private lastSource: CircuitPatchUpdateSource = 'seed';
  private lastPatchKey = '';
  private listeners = new Set<CircuitPatchListener>();

  getSnapshot(): CircuitPatchSnapshot {
    return {
      patch: this.patch,
      version: this.version,
      engine: this.engine,
      originSessionId: this.lastOriginSessionId,
      source: this.lastSource,
    };
  }

  publishPatch(
    patch: CircuitPatchEnvelope,
    options?: { originSessionId?: string | null; source?: CircuitPatchUpdateSource }
  ): CircuitPatchSnapshot {
    const nextPatch = {
      ...patch,
      source: options?.source ?? patch.source ?? 'manual',
    };
    const nextPatchKey = serializeCircuitPatchEnvelope(nextPatch);
    if (!nextPatchKey || nextPatchKey === this.lastPatchKey) {
      return this.getSnapshot();
    }

    this.patch = nextPatch;
    this.version += 1;
    this.lastOriginSessionId = options?.originSessionId ?? null;
    this.lastSource = options?.source ?? nextPatch.source ?? 'manual';
    this.lastPatchKey = nextPatchKey;

    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }

    return snapshot;
  }

  observe(listener: CircuitPatchListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy() {
    this.listeners.clear();
  }
}

function createStructuredLocalCollaborationDocument(projectId: string): ModuMakeCollaborationDocument {
  const code = new LocalCollaborationTextDocument();
  const circuit = new LocalCollaborationCircuitDocument();

  return {
    engine: 'structured-local',
    projectId,
    code,
    circuit,
    destroy() {
      code.destroy();
      circuit.destroy();
    },
  };
}

export function createModuMakeCollaborationDocument(projectId: string): ModuMakeCollaborationDocument {
  const yjsFactory = loadGeneratedYjsCollaborationDocumentFactory();
  const yjsDocument = yjsFactory?.(projectId) ?? null;

  if (yjsDocument) {
    return yjsDocument;
  }

  return createStructuredLocalCollaborationDocument(projectId);
}
