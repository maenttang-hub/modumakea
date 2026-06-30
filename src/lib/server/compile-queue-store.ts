import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CompileJobRequest, CompileQueueJobRecord, CompileQueueJobState } from '@/types';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

export interface ClaimedCompileQueueJobRecord extends CompileQueueJobRecord {
  payload: CompileJobRequest;
}

interface CompileQueueSnapshot {
  version: 1;
  jobs: ClaimedCompileQueueJobRecord[];
}

type QueueStoreMode = 'memory' | 'file' | 'supabase';

type CompileQueueJobRow = {
  queue_job_id: string;
  request_id: string;
  owner_key: string;
  board_id: string;
  required_libraries: string[] | null;
  source_code_hash: string;
  source_code_length: number;
  state: CompileQueueJobState;
  latest_result_id: string | null;
  payload_json: CompileJobRequest;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  build_logs: string | null;
  error_details: string | null;
  hex_binary: string | null;
};

const COMPILE_QUEUE_JOB_SELECT = [
  'queue_job_id',
  'request_id',
  'owner_key',
  'board_id',
  'required_libraries',
  'source_code_hash',
  'source_code_length',
  'state',
  'latest_result_id',
  'payload_json',
  'created_at',
  'updated_at',
  'started_at',
  'completed_at',
  'build_logs',
  'error_details',
  'hex_binary',
].join(',');

const memoryQueueStore = new Map<string, ClaimedCompileQueueJobRecord>();
let storeLock: Promise<unknown> = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function hashSourceCode(sourceCode: string) {
  return createHash('sha256').update(sourceCode).digest('hex');
}

function readQueueStoreMode(): QueueStoreMode {
  const normalized = process.env.MODUMAKE_COMPILE_QUEUE_STORE?.trim().toLowerCase();
  if (normalized === 'memory') {
    return 'memory';
  }
  if (normalized === 'supabase') {
    return 'supabase';
  }
  return 'file';
}

function getCompileQueueFilePath() {
  const configured = process.env.MODUMAKE_COMPILE_QUEUE_FILE?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), '.modumake', 'compile-queue-store.json');
}

function toPublicRecord(job: ClaimedCompileQueueJobRecord): CompileQueueJobRecord {
  return {
    queueJobId: job.queueJobId,
    requestId: job.requestId,
    ownerKey: job.ownerKey,
    boardId: job.boardId,
    requiredLibraries: [...job.requiredLibraries],
    sourceCodeHash: job.sourceCodeHash,
    sourceCodeLength: job.sourceCodeLength,
    state: job.state,
    latestResultId: job.latestResultId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    buildLogs: job.buildLogs,
    errorDetails: job.errorDetails,
    hexBinary: job.hexBinary,
  };
}

function getSupabase() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Supabase admin client is not configured.');
  }
  return supabase;
}

function isMissingRpcFunction(error: { message?: string; code?: string } | null) {
  if (!error) {
    return false;
  }

  return error.code === 'PGRST202' || /Could not find the function|does not exist/i.test(error.message || '');
}

function fromSupabaseRow(row: CompileQueueJobRow): ClaimedCompileQueueJobRecord {
  return {
    queueJobId: row.queue_job_id,
    requestId: row.request_id,
    ownerKey: row.owner_key,
    boardId: row.board_id,
    requiredLibraries: [...(row.required_libraries ?? [])],
    sourceCodeHash: row.source_code_hash,
    sourceCodeLength: row.source_code_length,
    state: row.state,
    latestResultId: row.latest_result_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    buildLogs: row.build_logs ?? undefined,
    errorDetails: row.error_details ?? undefined,
    hexBinary: row.hex_binary ?? undefined,
    payload: {
      jobId: row.payload_json.jobId,
      boardId: row.payload_json.boardId,
      sourceCode: row.payload_json.sourceCode,
      requiredLibraries: [...row.payload_json.requiredLibraries],
    },
  };
}

function toSupabaseRow(job: ClaimedCompileQueueJobRecord): CompileQueueJobRow {
  return {
    queue_job_id: job.queueJobId,
    request_id: job.requestId,
    owner_key: job.ownerKey,
    board_id: job.boardId,
    required_libraries: [...job.requiredLibraries],
    source_code_hash: job.sourceCodeHash,
    source_code_length: job.sourceCodeLength,
    state: job.state,
    latest_result_id: job.latestResultId ?? null,
    payload_json: {
      jobId: job.payload.jobId,
      boardId: job.payload.boardId,
      sourceCode: job.payload.sourceCode,
      requiredLibraries: [...job.payload.requiredLibraries],
    },
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    started_at: job.startedAt ?? null,
    completed_at: job.completedAt ?? null,
    build_logs: job.buildLogs ?? null,
    error_details: job.errorDetails ?? null,
    hex_binary: job.hexBinary ?? null,
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

async function readFileQueueSnapshot(): Promise<CompileQueueSnapshot> {
  const filePath = getCompileQueueFilePath();

  try {
    const raw = await readFile(/* turbopackIgnore: true */ filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CompileQueueSnapshot>;
    return {
      version: 1,
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs as ClaimedCompileQueueJobRecord[] : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { version: 1, jobs: [] };
    }

    throw error;
  }
}

async function writeFileQueueSnapshot(snapshot: CompileQueueSnapshot) {
  const filePath = getCompileQueueFilePath();
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

async function readStoredJobs(): Promise<ClaimedCompileQueueJobRecord[]> {
  const mode = readQueueStoreMode();
  if (mode === 'memory') {
    return Array.from(memoryQueueStore.values());
  }
  if (mode === 'supabase') {
    const { data, error } = await getSupabase()
      .from('compile_queue_jobs')
      .select(COMPILE_QUEUE_JOB_SELECT)
      .order('created_at', { ascending: true })
      .overrideTypes<CompileQueueJobRow[], { merge: false }>();

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map(fromSupabaseRow);
  }

  const snapshot = await readFileQueueSnapshot();
  return snapshot.jobs;
}

async function getStoredCompileQueueJob(queueJobId: string) {
  if (readQueueStoreMode() === 'supabase') {
    const { data, error } = await getSupabase()
      .from('compile_queue_jobs')
      .select(COMPILE_QUEUE_JOB_SELECT)
      .eq('queue_job_id', queueJobId)
      .maybeSingle<CompileQueueJobRow>();

    if (error) {
      throw new Error(error.message);
    }

    return data ? fromSupabaseRow(data) : null;
  }

  const jobs = await readStoredJobs();
  return jobs.find(candidate => candidate.queueJobId === queueJobId) ?? null;
}

async function writeStoredJobs(jobs: ClaimedCompileQueueJobRecord[]) {
  const mode = readQueueStoreMode();
  if (mode === 'memory') {
    memoryQueueStore.clear();
    for (const job of jobs) {
      memoryQueueStore.set(job.queueJobId, job);
    }
    return;
  }
  if (mode === 'supabase') {
    throw new Error('Supabase compile queue store does not support bulk rewrite.');
  }

  await writeFileQueueSnapshot({ version: 1, jobs });
}

function buildUpdatedJob(
  existing: ClaimedCompileQueueJobRecord,
  patch: {
    state: CompileQueueJobState;
    latestResultId?: string;
    buildLogs?: string;
    errorDetails?: string;
    hexBinary?: string;
  }
) {
  const updatedAt = nowIso();

  return {
    ...existing,
    state: patch.state,
    latestResultId: patch.latestResultId ?? existing.latestResultId,
    updatedAt,
    buildLogs: patch.buildLogs ?? existing.buildLogs,
    errorDetails: patch.errorDetails ?? existing.errorDetails,
    hexBinary: patch.hexBinary ?? existing.hexBinary,
    startedAt:
      patch.state === 'dispatching' || patch.state === 'running'
        ? existing.startedAt ?? updatedAt
        : existing.startedAt,
    completedAt:
      patch.state === 'succeeded' || patch.state === 'failed'
        ? updatedAt
        : existing.completedAt,
  };
}

export function buildCompileQueuePollPath(queueJobId: string) {
  return `/api/compile/job/${queueJobId}`;
}

export function buildCompileQueueOwnerKey(requestId?: string) {
  return requestId?.trim() || 'anonymous';
}

export async function enqueueCompileJob(
  payload: CompileJobRequest,
  options?: { requestId?: string; ownerKey?: string }
) {
  return withStoreLock(async () => {
    const createdAt = nowIso();
    const queueJobId = randomUUID();
    const record: ClaimedCompileQueueJobRecord = {
      queueJobId,
      requestId: options?.requestId?.trim() || `compile-${Date.now()}`,
      ownerKey: options?.ownerKey?.trim() || buildCompileQueueOwnerKey(options?.requestId),
      boardId: payload.boardId,
      requiredLibraries: [...payload.requiredLibraries],
      sourceCodeHash: hashSourceCode(payload.sourceCode),
      sourceCodeLength: payload.sourceCode.length,
      state: 'queued',
      createdAt,
      updatedAt: createdAt,
      payload: {
        jobId: payload.jobId,
        boardId: payload.boardId,
        sourceCode: payload.sourceCode,
        requiredLibraries: [...payload.requiredLibraries],
      },
    };

    if (readQueueStoreMode() === 'supabase') {
      const { error } = await getSupabase()
        .from('compile_queue_jobs')
        .insert(toSupabaseRow(record));

      if (error) {
        throw new Error(error.message);
      }

      return toPublicRecord(record);
    }

    const jobs = await readStoredJobs();
    jobs.push(record);
    await writeStoredJobs(jobs);
    return toPublicRecord(record);
  });
}

export async function getCompileQueueJob(queueJobId: string) {
  const job = await getStoredCompileQueueJob(queueJobId);
  return job ? toPublicRecord(job) : null;
}

export async function listCompileQueueJobs() {
  const jobs = await readStoredJobs();
  return jobs
    .map(toPublicRecord)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function claimNextQueuedCompileJob() {
  return withStoreLock(async () => {
    if (readQueueStoreMode() === 'supabase') {
      const rpc = await getSupabase().rpc('claim_next_compile_queue_job');
      if (!rpc.error && rpc.data) {
        return fromSupabaseRow(rpc.data as CompileQueueJobRow);
      }
      if (rpc.error && !isMissingRpcFunction(rpc.error)) {
        throw new Error(rpc.error.message);
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data, error } = await getSupabase()
          .from('compile_queue_jobs')
          .select(COMPILE_QUEUE_JOB_SELECT)
          .eq('state', 'queued')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle<CompileQueueJobRow>();

        if (error) {
          throw new Error(error.message);
        }

        if (!data) {
          return null;
        }

        const claimed = buildUpdatedJob(fromSupabaseRow(data), { state: 'dispatching' });
        const { data: updated, error: updateError } = await getSupabase()
          .from('compile_queue_jobs')
          .update({
            state: claimed.state,
            latest_result_id: claimed.latestResultId ?? null,
            updated_at: claimed.updatedAt,
            started_at: claimed.startedAt ?? null,
          })
          .eq('queue_job_id', claimed.queueJobId)
          .eq('state', 'queued')
          .select(COMPILE_QUEUE_JOB_SELECT)
          .maybeSingle<CompileQueueJobRow>();

        if (updateError) {
          throw new Error(updateError.message);
        }

        if (updated) {
          return fromSupabaseRow(updated);
        }
      }

      return null;
    }

    const jobs = await readStoredJobs();
    const nextIndex = jobs
      .map((job, index) => ({ job, index }))
      .filter(({ job }) => job.state === 'queued')
      .sort((left, right) => left.job.createdAt.localeCompare(right.job.createdAt))[0]?.index;

    if (nextIndex === undefined) {
      return null;
    }

    const claimed = buildUpdatedJob(jobs[nextIndex], { state: 'dispatching' });
    jobs[nextIndex] = claimed;
    await writeStoredJobs(jobs);
    return claimed;
  });
}

export async function updateCompileQueueJobState(
  queueJobId: string,
  patch: {
    state: CompileQueueJobState;
    latestResultId?: string;
    buildLogs?: string;
    errorDetails?: string;
    hexBinary?: string;
  }
) {
  return withStoreLock(async () => {
    if (readQueueStoreMode() === 'supabase') {
      const existing = await getStoredCompileQueueJob(queueJobId);
      if (!existing) {
        return null;
      }

      const next = buildUpdatedJob(existing, patch);
      const rpc = await getSupabase().rpc('update_compile_queue_job_state', {
        p_queue_job_id: queueJobId,
        p_state: next.state,
        p_latest_result_id: next.latestResultId ?? null,
        p_build_logs: next.buildLogs ?? null,
        p_error_details: next.errorDetails ?? null,
        p_hex_binary: next.hexBinary ?? null,
      });
      if (!rpc.error && rpc.data) {
        return toPublicRecord(fromSupabaseRow(rpc.data as CompileQueueJobRow));
      }
      if (rpc.error && !isMissingRpcFunction(rpc.error)) {
        throw new Error(rpc.error.message);
      }

      const updatePayload: Partial<CompileQueueJobRow> = {
        state: next.state,
        latest_result_id: next.latestResultId ?? null,
        updated_at: next.updatedAt,
        started_at: next.startedAt ?? null,
        completed_at: next.completedAt ?? null,
        build_logs: next.buildLogs ?? null,
        error_details: next.errorDetails ?? null,
        hex_binary: next.hexBinary ?? null,
      };

      const { data, error } = await getSupabase()
        .from('compile_queue_jobs')
        .update(updatePayload)
        .eq('queue_job_id', queueJobId)
        .select(COMPILE_QUEUE_JOB_SELECT)
        .maybeSingle<CompileQueueJobRow>();

      if (error) {
        throw new Error(error.message);
      }

      return data ? toPublicRecord(fromSupabaseRow(data)) : null;
    }

    const jobs = await readStoredJobs();
    const index = jobs.findIndex(candidate => candidate.queueJobId === queueJobId);
    if (index < 0) {
      return null;
    }

    const next = buildUpdatedJob(jobs[index], patch);
    jobs[index] = next;
    await writeStoredJobs(jobs);
    return toPublicRecord(next);
  });
}

export async function clearCompileQueueStore() {
  await withStoreLock(async () => {
    const mode = readQueueStoreMode();
    if (mode === 'memory') {
      memoryQueueStore.clear();
      return;
    }
    if (mode === 'supabase') {
      throw new Error('Refusing to clear the Supabase compile queue store.');
    }

    const filePath = getCompileQueueFilePath();
    await rm(filePath, { force: true });
  });
}
