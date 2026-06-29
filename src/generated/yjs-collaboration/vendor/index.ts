import type {
  CircuitPatchEnvelope,
  CircuitPatchSnapshot,
  CircuitPatchUpdateSource,
  CollaborationCircuitDocument,
  CollaborationDocEngine,
  CollaborationTextDocument,
  ModuMakeCollaborationDocument,
  SharedCodeSnapshot,
  SharedCodeUpdateSource,
} from '@/lib/collaboration-doc';
import type { ModuMakeYjsCollaborationDocumentFactory } from '../index';

type SharedCodeListener = (snapshot: SharedCodeSnapshot) => void;
type CircuitPatchListener = (snapshot: CircuitPatchSnapshot) => void;

type VendoredWireMessage =
  | {
      kind: 'code';
      nonce: string;
      text: string;
      originSessionId: string | null;
      source: SharedCodeUpdateSource;
    }
  | {
      kind: 'circuit';
      nonce: string;
      patch: CircuitPatchEnvelope;
      originSessionId: string | null;
      source: CircuitPatchUpdateSource;
    };

const MEMORY_CHANNELS = new Map<string, Set<(message: VendoredWireMessage) => void>>();

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

function createNonce() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `vendored-${Math.random().toString(36).slice(2, 12)}`;
}

function buildChannelName(projectId: string) {
  return `modumake-yjs-collaboration:${projectId}`;
}

class VendoredSharedTransport {
  private readonly channelName: string;
  private readonly memoryListener: (message: VendoredWireMessage) => void;
  private readonly broadcastChannel: BroadcastChannel | null;

  constructor(
    projectId: string,
    onMessage: (message: VendoredWireMessage) => void
  ) {
    this.channelName = buildChannelName(projectId);
    this.memoryListener = onMessage;
    const memoryChannel = MEMORY_CHANNELS.get(this.channelName) ?? new Set();
    memoryChannel.add(onMessage);
    MEMORY_CHANNELS.set(this.channelName, memoryChannel);

    if (typeof BroadcastChannel === 'undefined') {
      this.broadcastChannel = null;
      return;
    }

    const channel = new BroadcastChannel(this.channelName);
    channel.addEventListener('message', event => {
      const payload = event.data;
      if (!payload || typeof payload !== 'object') {
        return;
      }
      onMessage(payload as VendoredWireMessage);
    });
    this.broadcastChannel = channel;
  }

  send(message: VendoredWireMessage) {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(message);
      return;
    }

    const listeners = MEMORY_CHANNELS.get(this.channelName);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      if (listener === this.memoryListener) {
        continue;
      }
      listener(message);
    }
  }

  destroy() {
    const listeners = MEMORY_CHANNELS.get(this.channelName);
    if (listeners) {
      listeners.delete(this.memoryListener);
      if (listeners.size === 0) {
        MEMORY_CHANNELS.delete(this.channelName);
      }
    }

    this.broadcastChannel?.close();
  }
}

class VendoredYjsTextDocument implements CollaborationTextDocument {
  readonly engine: CollaborationDocEngine = 'yjs';

  private text = '';
  private version = 0;
  private lastOriginSessionId: string | null = null;
  private lastSource: SharedCodeUpdateSource = 'seed';
  private readonly listeners = new Set<SharedCodeListener>();
  private readonly seenNonces = new Set<string>();
  private readonly transport: VendoredSharedTransport;

  constructor(projectId: string) {
    this.transport = new VendoredSharedTransport(projectId, message => {
      if (message.kind !== 'code' || this.seenNonces.has(message.nonce)) {
        return;
      }

      this.seenNonces.add(message.nonce);
      this.applyText(message.text, {
        originSessionId: message.originSessionId,
        source: 'remote',
      });
    });
  }

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
  ) {
    const snapshot = this.applyText(text, options);
    if (!snapshot || options?.source === 'remote') {
      return this.getSnapshot();
    }

    const nonce = createNonce();
    this.seenNonces.add(nonce);
    this.transport.send({
      kind: 'code',
      nonce,
      text: snapshot.text,
      originSessionId: snapshot.originSessionId,
      source: snapshot.source,
    });
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
    this.transport.destroy();
    this.seenNonces.clear();
  }

  private applyText(
    text: string,
    options?: { originSessionId?: string | null; source?: SharedCodeUpdateSource }
  ) {
    if (text === this.text) {
      return null;
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
}

class VendoredYjsCircuitDocument implements CollaborationCircuitDocument {
  readonly engine: CollaborationDocEngine = 'yjs';

  private patch: CircuitPatchEnvelope | null = null;
  private version = 0;
  private lastOriginSessionId: string | null = null;
  private lastSource: CircuitPatchUpdateSource = 'seed';
  private lastPatchKey = '';
  private readonly listeners = new Set<CircuitPatchListener>();
  private readonly seenNonces = new Set<string>();
  private readonly transport: VendoredSharedTransport;

  constructor(projectId: string) {
    this.transport = new VendoredSharedTransport(projectId, message => {
      if (message.kind !== 'circuit' || this.seenNonces.has(message.nonce)) {
        return;
      }

      this.seenNonces.add(message.nonce);
      this.applyPatch(message.patch, {
        originSessionId: message.originSessionId,
        source: 'remote',
      });
    });
  }

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
  ) {
    const snapshot = this.applyPatch(patch, options);
    if (!snapshot || options?.source === 'remote') {
      return this.getSnapshot();
    }

    const nonce = createNonce();
    this.seenNonces.add(nonce);
    this.transport.send({
      kind: 'circuit',
      nonce,
      patch: snapshot.patch ?? patch,
      originSessionId: snapshot.originSessionId,
      source: snapshot.source,
    });
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
    this.transport.destroy();
    this.seenNonces.clear();
  }

  private applyPatch(
    patch: CircuitPatchEnvelope,
    options?: { originSessionId?: string | null; source?: CircuitPatchUpdateSource }
  ) {
    const patchSource = patch.source ?? options?.source ?? 'manual';
    const nextPatch: CircuitPatchEnvelope = {
      ...patch,
      source: patchSource,
    };
    const nextPatchKey = serializeCircuitPatchEnvelope(nextPatch);
    if (!nextPatchKey || nextPatchKey === this.lastPatchKey) {
      return null;
    }

    this.patch = nextPatch;
    this.version += 1;
    this.lastOriginSessionId = options?.originSessionId ?? null;
    this.lastSource = options?.source ?? patchSource;
    this.lastPatchKey = nextPatchKey;

    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
    return snapshot;
  }
}

function createVendoredYjsCollaborationDocument(projectId: string): ModuMakeCollaborationDocument {
  const code = new VendoredYjsTextDocument(projectId);
  const circuit = new VendoredYjsCircuitDocument(projectId);

  return {
    engine: 'yjs',
    projectId,
    code,
    circuit,
    destroy() {
      code.destroy();
      circuit.destroy();
    },
  };
}

export function loadVendoredYjsCollaborationDocumentFactory(): ModuMakeYjsCollaborationDocumentFactory | null {
  return createVendoredYjsCollaborationDocument;
}
