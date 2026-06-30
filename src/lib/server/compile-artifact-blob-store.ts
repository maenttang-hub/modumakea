import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertValidProductionSecret,
  getCompileBackendSharedToken,
} from '@/lib/compile-policy';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

type ArtifactBlobStoreMode = 'memory' | 'file' | 'supabase';
type ArtifactStorageBackend = 'memory-inline' | 'file-object' | 'supabase-storage';

interface ArtifactBlobSnapshot {
  version: 1;
  blobs: Array<{
    artifactId: string;
    contentBase64: string;
  }>;
}

const memoryBlobStore = new Map<string, string>();
let blobStoreLock: Promise<unknown> = Promise.resolve();

function readArtifactBlobStoreMode(): ArtifactBlobStoreMode {
  const normalized = (
    process.env.MODUMAKE_COMPILE_ARTIFACT_BLOB_STORE ??
    process.env.MODUMAKE_COMPILE_RESULT_STORE ??
    process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_STORE ??
    process.env.MODUMAKE_COMPILE_QUEUE_STORE
  )?.trim().toLowerCase();

  if (normalized === 'memory') {
    return 'memory';
  }
  if (normalized === 'supabase') {
    return 'supabase';
  }
  return 'file';
}

function getArtifactBlobRootPath() {
  const configured = process.env.MODUMAKE_COMPILE_ARTIFACT_BLOB_ROOT?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), '.modumake', 'compile-artifact-blobs');
}

function getArtifactBlobSnapshotPath() {
  return path.join(getArtifactBlobRootPath(), 'artifact-blobs.json');
}

function getSupabase() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Supabase admin client is not configured.');
  }
  return supabase;
}

function getSupabaseBucketName() {
  return process.env.MODUMAKE_COMPILE_ARTIFACT_BUCKET?.trim() || 'compile-artifacts';
}

function getArtifactDownloadSecret() {
  const explicit = process.env.MODUMAKE_ARTIFACT_DOWNLOAD_SECRET?.trim();
  if (explicit) {
    assertValidProductionSecret('MODUMAKE_ARTIFACT_DOWNLOAD_SECRET', explicit);
    return explicit;
  }

  const compileToken = getCompileBackendSharedToken();
  if (compileToken) {
    return compileToken;
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'modumake-local-artifact-download-secret';
  }

  throw new Error('MODUMAKE_ARTIFACT_DOWNLOAD_SECRET is required to issue artifact download URLs.');
}

async function withBlobStoreLock<T>(work: () => Promise<T>): Promise<T> {
  const next = blobStoreLock.then(work, work);
  blobStoreLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function readFileSnapshot(): Promise<ArtifactBlobSnapshot> {
  const filePath = getArtifactBlobSnapshotPath();
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ArtifactBlobSnapshot>;
    return {
      version: 1,
      blobs: Array.isArray(parsed.blobs)
        ? (parsed.blobs as ArtifactBlobSnapshot['blobs'])
        : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { version: 1, blobs: [] };
    }
    throw error;
  }
}

async function writeFileSnapshot(snapshot: ArtifactBlobSnapshot) {
  const filePath = getArtifactBlobSnapshotPath();
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

export async function putCompileArtifactBlob(input: {
  artifactId: string;
  contentBase64: string;
  queueJobId: string;
}) {
  return withBlobStoreLock(async () => {
    const mode = readArtifactBlobStoreMode();
    if (mode === 'memory') {
      memoryBlobStore.set(input.artifactId, input.contentBase64);
      return {
        storageBackend: 'memory-inline' as ArtifactStorageBackend,
        storageObjectKey: input.artifactId,
      };
    }

    if (mode === 'supabase') {
      const storageObjectKey = `${input.queueJobId}/${input.artifactId}.hex.b64`;
      const { error } = await getSupabase()
        .storage
        .from(getSupabaseBucketName())
        .upload(storageObjectKey, Buffer.from(input.contentBase64, 'utf8'), {
          upsert: true,
          contentType: 'text/plain; charset=utf-8',
        });

      if (error) {
        throw new Error(error.message);
      }

      return {
        storageBackend: 'supabase-storage' as ArtifactStorageBackend,
        storageObjectKey,
      };
    }

    const rootPath = getArtifactBlobRootPath();
    const objectKey = `${input.artifactId}.hex.b64`;
    const filePath = path.join(rootPath, objectKey);
    await mkdir(rootPath, { recursive: true });
    await writeFile(filePath, input.contentBase64, 'utf8');

    const snapshot = await readFileSnapshot();
    const nextBlobs = snapshot.blobs.filter(candidate => candidate.artifactId !== input.artifactId);
    nextBlobs.push({ artifactId: input.artifactId, contentBase64: input.contentBase64 });
    await writeFileSnapshot({ version: 1, blobs: nextBlobs });

    return {
      storageBackend: 'file-object' as ArtifactStorageBackend,
      storageObjectKey: objectKey,
    };
  });
}

export async function readCompileArtifactBlobContent(input: {
  artifactId: string;
  storageBackend: ArtifactStorageBackend;
  storageObjectKey: string;
}) {
  const mode = readArtifactBlobStoreMode();

  if (input.storageBackend === 'memory-inline' || mode === 'memory') {
    return memoryBlobStore.get(input.artifactId) ?? null;
  }

  if (input.storageBackend === 'supabase-storage' || mode === 'supabase') {
    const { data, error } = await getSupabase()
      .storage
      .from(getSupabaseBucketName())
      .download(input.storageObjectKey);
    if (error) {
      throw new Error(error.message);
    }
    return await data.text();
  }

  const filePath = path.join(/* turbopackIgnore: true */ getArtifactBlobRootPath(), input.storageObjectKey);
  try {
    return await readFile(/* turbopackIgnore: true */ filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function buildArtifactDownloadSignature(artifactId: string, expiresAt: string) {
  return createHmac('sha256', getArtifactDownloadSecret())
    .update(`${artifactId}:${expiresAt}`)
    .digest('hex');
}

export function issueCompileArtifactDownloadPath(artifactId: string, ttlSeconds = 300) {
  const expiresAt = String(Date.now() + ttlSeconds * 1000);
  const signature = buildArtifactDownloadSignature(artifactId, expiresAt);
  return `/api/compile/artifact/${artifactId}?expires=${encodeURIComponent(expiresAt)}&signature=${encodeURIComponent(signature)}`;
}

export function verifyCompileArtifactDownloadSignature(input: {
  artifactId: string;
  expiresAt: string;
  signature: string;
}) {
  const expiresAtMs = Number(input.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return false;
  }

  const expected = buildArtifactDownloadSignature(input.artifactId, input.expiresAt);
  return expected === input.signature;
}

export async function clearCompileArtifactBlobStore() {
  await withBlobStoreLock(async () => {
    const mode = readArtifactBlobStoreMode();
    if (mode === 'memory') {
      memoryBlobStore.clear();
      return;
    }
    if (mode === 'supabase') {
      throw new Error('Refusing to clear the Supabase compile artifact blob store.');
    }
    await rm(getArtifactBlobRootPath(), { recursive: true, force: true });
  });
}
