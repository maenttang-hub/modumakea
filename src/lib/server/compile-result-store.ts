import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CompileArtifactRecord,
  CompileExecutionResultRecord,
  CompileExecutionResultState,
} from '@/types';
import {
  clearCompileArtifactBlobStore,
  putCompileArtifactBlob,
  readCompileArtifactBlobContent,
} from '@/lib/server/compile-artifact-blob-store';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

interface StoredCompileArtifactRecord extends CompileArtifactRecord {
  storageBackend: 'memory-inline' | 'file-object' | 'supabase-storage';
  storageObjectKey: string;
}

interface CompileResultStoreSnapshot {
  version: 1;
  results: CompileExecutionResultRecord[];
  artifacts: StoredCompileArtifactRecord[];
}

type CompileResultStoreMode = 'memory' | 'file' | 'supabase';

type CompileExecutionResultRow = {
  result_id: string;
  launch_request_id: string;
  queue_job_id: string;
  state: CompileExecutionResultState;
  created_at: string;
  updated_at: string;
  primary_artifact_id: string | null;
  build_logs: string | null;
  error_details: string | null;
};

type CompileArtifactRow = {
  artifact_id: string;
  result_id: string;
  kind: 'hex';
  created_at: string;
  size_bytes: number;
  storage_backend: 'memory-inline' | 'file-object' | 'supabase-storage';
  storage_object_key: string;
};

const memoryResults = new Map<string, CompileExecutionResultRecord>();
const memoryArtifacts = new Map<string, StoredCompileArtifactRecord>();
let storeLock: Promise<unknown> = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function readCompileResultStoreMode(): CompileResultStoreMode {
  const normalized = (
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

function getCompileResultStoreFilePath() {
  const configured = process.env.MODUMAKE_COMPILE_RESULT_FILE?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), '.modumake', 'compile-results.json');
}

function getSupabase() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Supabase admin client is not configured.');
  }
  return supabase;
}

function toPublicArtifact(artifact: StoredCompileArtifactRecord): CompileArtifactRecord {
  return {
    artifactId: artifact.artifactId,
    resultId: artifact.resultId,
    kind: artifact.kind,
    createdAt: artifact.createdAt,
    sizeBytes: artifact.sizeBytes,
  };
}

function fromResultRow(row: CompileExecutionResultRow): CompileExecutionResultRecord {
  return {
    resultId: row.result_id,
    launchRequestId: row.launch_request_id,
    queueJobId: row.queue_job_id,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    primaryArtifactId: row.primary_artifact_id ?? undefined,
    buildLogs: row.build_logs ?? undefined,
    errorDetails: row.error_details ?? undefined,
  };
}

function toResultRow(result: CompileExecutionResultRecord): CompileExecutionResultRow {
  return {
    result_id: result.resultId,
    launch_request_id: result.launchRequestId,
    queue_job_id: result.queueJobId,
    state: result.state,
    created_at: result.createdAt,
    updated_at: result.updatedAt,
    primary_artifact_id: result.primaryArtifactId ?? null,
    build_logs: result.buildLogs ?? null,
    error_details: result.errorDetails ?? null,
  };
}

function fromArtifactRow(row: CompileArtifactRow): StoredCompileArtifactRecord {
  return {
    artifactId: row.artifact_id,
    resultId: row.result_id,
    kind: row.kind,
    createdAt: row.created_at,
    sizeBytes: row.size_bytes,
    storageBackend: row.storage_backend,
    storageObjectKey: row.storage_object_key,
  };
}

function toArtifactRow(artifact: StoredCompileArtifactRecord): CompileArtifactRow {
  return {
    artifact_id: artifact.artifactId,
    result_id: artifact.resultId,
    kind: artifact.kind,
    created_at: artifact.createdAt,
    size_bytes: artifact.sizeBytes,
    storage_backend: artifact.storageBackend,
    storage_object_key: artifact.storageObjectKey,
  };
}

async function withStoreLock<T>(work: () => Promise<T>): Promise<T> {
  const next = storeLock.then(work, work);
  storeLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function readFileSnapshot(): Promise<CompileResultStoreSnapshot> {
  const filePath = getCompileResultStoreFilePath();
  try {
    const raw = await readFile(/* turbopackIgnore: true */ filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CompileResultStoreSnapshot>;
    return {
      version: 1,
      results: Array.isArray(parsed.results) ? (parsed.results as CompileExecutionResultRecord[]) : [],
      artifacts: Array.isArray(parsed.artifacts)
        ? (parsed.artifacts as StoredCompileArtifactRecord[])
        : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { version: 1, results: [], artifacts: [] };
    }
    throw error;
  }
}

async function writeFileSnapshot(snapshot: CompileResultStoreSnapshot) {
  const filePath = getCompileResultStoreFilePath();
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

async function readStoredSnapshot() {
  const mode = readCompileResultStoreMode();
  if (mode === 'memory') {
    return {
      results: Array.from(memoryResults.values()),
      artifacts: Array.from(memoryArtifacts.values()),
    };
  }
  if (mode === 'supabase') {
    const [{ data: resultData, error: resultError }, { data: artifactData, error: artifactError }] =
      await Promise.all([
        getSupabase()
          .from('compile_execution_results')
          .select('result_id,launch_request_id,queue_job_id,state,created_at,updated_at,primary_artifact_id,build_logs,error_details'),
        getSupabase()
          .from('compile_artifacts')
          .select('artifact_id,result_id,kind,created_at,size_bytes,storage_backend,storage_object_key'),
      ]);

    if (resultError) {
      throw new Error(resultError.message);
    }
    if (artifactError) {
      throw new Error(artifactError.message);
    }

    return {
      results: ((resultData ?? []) as CompileExecutionResultRow[]).map(fromResultRow),
      artifacts: ((artifactData ?? []) as CompileArtifactRow[]).map(fromArtifactRow),
    };
  }

  const snapshot = await readFileSnapshot();
  return snapshot;
}

async function writeStoredSnapshot(snapshot: CompileResultStoreSnapshot) {
  const mode = readCompileResultStoreMode();
  if (mode === 'memory') {
    memoryResults.clear();
    memoryArtifacts.clear();
    for (const result of snapshot.results) {
      memoryResults.set(result.resultId, result);
    }
    for (const artifact of snapshot.artifacts) {
      memoryArtifacts.set(artifact.artifactId, artifact);
    }
    return;
  }
  if (mode === 'supabase') {
    throw new Error('Supabase compile result store does not support bulk rewrite.');
  }
  await writeFileSnapshot(snapshot);
}

export async function recordCompileExecutionResult(input: {
  launchRequestId: string;
  queueJobId: string;
  state: CompileExecutionResultState;
  buildLogs?: string;
  errorDetails?: string;
  hexBinary?: string;
}) {
  return withStoreLock(async () => {
    const createdAt = nowIso();
    const resultId = randomUUID();
    let artifact: StoredCompileArtifactRecord | null = null;

    if (input.hexBinary) {
      const artifactId = randomUUID();
      const blob = await putCompileArtifactBlob({
        artifactId,
        contentBase64: input.hexBinary,
        queueJobId: input.queueJobId,
      });
      artifact = {
        artifactId,
        resultId,
        kind: 'hex',
        createdAt,
        sizeBytes: input.hexBinary.length,
        storageBackend: blob.storageBackend,
        storageObjectKey: blob.storageObjectKey,
      };
    }

    const result: CompileExecutionResultRecord = {
      resultId,
      launchRequestId: input.launchRequestId,
      queueJobId: input.queueJobId,
      state: input.state,
      createdAt,
      updatedAt: createdAt,
      primaryArtifactId: artifact?.artifactId,
      buildLogs: input.buildLogs,
      errorDetails: input.errorDetails,
    };

    if (readCompileResultStoreMode() === 'supabase') {
      const { error: resultError } = await getSupabase()
        .from('compile_execution_results')
        .insert(toResultRow(result));
      if (resultError) {
        throw new Error(resultError.message);
      }
      if (artifact) {
        const { error: artifactError } = await getSupabase()
          .from('compile_artifacts')
          .insert(toArtifactRow(artifact));
        if (artifactError) {
          throw new Error(artifactError.message);
        }
      }
      return {
        result,
        artifact: artifact ? toPublicArtifact(artifact) : null,
      };
    }

    const snapshot = await readStoredSnapshot();
    snapshot.results.push(result);
    if (artifact) {
      snapshot.artifacts.push(artifact);
    }
    await writeStoredSnapshot({
      version: 1,
      results: snapshot.results,
      artifacts: snapshot.artifacts,
    });
    return {
      result,
      artifact: artifact ? toPublicArtifact(artifact) : null,
    };
  });
}

export async function getCompileExecutionResult(resultId: string) {
  const snapshot = await readStoredSnapshot();
  return snapshot.results.find(candidate => candidate.resultId === resultId) ?? null;
}

export async function listCompileExecutionResultsForQueueJob(queueJobId: string) {
  const snapshot = await readStoredSnapshot();
  return snapshot.results
    .filter(candidate => candidate.queueJobId === queueJobId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getCompileArtifact(artifactId: string) {
  const snapshot = await readStoredSnapshot();
  const artifact = snapshot.artifacts.find(candidate => candidate.artifactId === artifactId);
  return artifact ? toPublicArtifact(artifact) : null;
}

export async function getCompileArtifactBlob(artifactId: string) {
  const snapshot = await readStoredSnapshot();
  const artifact = snapshot.artifacts.find(candidate => candidate.artifactId === artifactId);
  if (!artifact) {
    return null;
  }

  const contentBase64 = await readCompileArtifactBlobContent({
    artifactId,
    storageBackend: artifact.storageBackend,
    storageObjectKey: artifact.storageObjectKey,
  });

  if (!contentBase64) {
    return null;
  }

  return {
    artifact: toPublicArtifact(artifact),
    contentBase64,
  };
}

export async function clearCompileResultStore() {
  await withStoreLock(async () => {
    const mode = readCompileResultStoreMode();
    if (mode === 'memory') {
      memoryResults.clear();
      memoryArtifacts.clear();
      await clearCompileArtifactBlobStore();
      return;
    }
    if (mode === 'supabase') {
      throw new Error('Refusing to clear the Supabase compile result store.');
    }
    await rm(getCompileResultStoreFilePath(), { force: true });
    await clearCompileArtifactBlobStore();
  });
}
