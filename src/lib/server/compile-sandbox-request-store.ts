import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CompileJobRequest,
  CompileSandboxLaunchRequestRecord,
  CompileSandboxLaunchRequestState,
} from '@/types';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

interface StoredCompileSandboxLaunchRequestRecord extends CompileSandboxLaunchRequestRecord {
  payload: CompileJobRequest;
}

export interface ClaimedCompileSandboxLaunchRequestRecord extends CompileSandboxLaunchRequestRecord {
  payload: CompileJobRequest;
}

interface CompileSandboxLaunchRequestSnapshot {
  version: 1;
  requests: StoredCompileSandboxLaunchRequestRecord[];
}

type SandboxLaunchStoreMode = 'memory' | 'file' | 'supabase';

type CompileSandboxLaunchRequestRow = {
  launch_request_id: string;
  queue_job_id: string;
  request_id: string;
  owner_key: string;
  board_id: string;
  required_libraries: string[] | null;
  source_code_hash: string;
  source_code_length: number;
  state: CompileSandboxLaunchRequestState;
  latest_result_id: string | null;
  payload_json: CompileJobRequest;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  submitted_at: string | null;
  error_details: string | null;
};

const SANDBOX_LAUNCH_REQUEST_SELECT = [
  'launch_request_id',
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
  'claimed_at',
  'submitted_at',
  'error_details',
].join(',');

const memoryStore = new Map<string, StoredCompileSandboxLaunchRequestRecord>();
let storeLock: Promise<unknown> = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function readSandboxLaunchStoreMode(): SandboxLaunchStoreMode {
  const normalized = (
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

function getSandboxLaunchRequestFilePath() {
  const configured = process.env.MODUMAKE_COMPILE_SANDBOX_REQUEST_FILE?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }

  return path.join(process.cwd(), '.modumake', 'compile-sandbox-launch-requests.json');
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

function toPublicRecord(
  request: StoredCompileSandboxLaunchRequestRecord
): CompileSandboxLaunchRequestRecord {
  return {
    launchRequestId: request.launchRequestId,
    queueJobId: request.queueJobId,
    requestId: request.requestId,
    ownerKey: request.ownerKey,
    boardId: request.boardId,
    requiredLibraries: [...request.requiredLibraries],
    sourceCodeHash: request.sourceCodeHash,
    sourceCodeLength: request.sourceCodeLength,
    state: request.state,
    latestResultId: request.latestResultId,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    claimedAt: request.claimedAt,
    submittedAt: request.submittedAt,
    errorDetails: request.errorDetails,
  };
}

function toClaimedRecord(
  request: StoredCompileSandboxLaunchRequestRecord
): ClaimedCompileSandboxLaunchRequestRecord {
  return {
    ...toPublicRecord(request),
    payload: {
      jobId: request.payload.jobId,
      boardId: request.payload.boardId,
      sourceCode: request.payload.sourceCode,
      requiredLibraries: [...request.payload.requiredLibraries],
    },
  };
}

function fromSupabaseRow(
  row: CompileSandboxLaunchRequestRow
): StoredCompileSandboxLaunchRequestRecord {
  return {
    launchRequestId: row.launch_request_id,
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
    claimedAt: row.claimed_at ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    errorDetails: row.error_details ?? undefined,
    payload: {
      jobId: row.payload_json.jobId,
      boardId: row.payload_json.boardId,
      sourceCode: row.payload_json.sourceCode,
      requiredLibraries: [...row.payload_json.requiredLibraries],
    },
  };
}

function toSupabaseRow(
  request: StoredCompileSandboxLaunchRequestRecord
): CompileSandboxLaunchRequestRow {
  return {
    launch_request_id: request.launchRequestId,
    queue_job_id: request.queueJobId,
    request_id: request.requestId,
    owner_key: request.ownerKey,
    board_id: request.boardId,
    required_libraries: [...request.requiredLibraries],
    source_code_hash: request.sourceCodeHash,
    source_code_length: request.sourceCodeLength,
    state: request.state,
    latest_result_id: request.latestResultId ?? null,
    payload_json: {
      jobId: request.payload.jobId,
      boardId: request.payload.boardId,
      sourceCode: request.payload.sourceCode,
      requiredLibraries: [...request.payload.requiredLibraries],
    },
    created_at: request.createdAt,
    updated_at: request.updatedAt,
    claimed_at: request.claimedAt ?? null,
    submitted_at: request.submittedAt ?? null,
    error_details: request.errorDetails ?? null,
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

async function readFileSnapshot(): Promise<CompileSandboxLaunchRequestSnapshot> {
  const filePath = getSandboxLaunchRequestFilePath();

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CompileSandboxLaunchRequestSnapshot>;
    return {
      version: 1,
      requests: Array.isArray(parsed.requests)
        ? (parsed.requests as StoredCompileSandboxLaunchRequestRecord[])
        : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { version: 1, requests: [] };
    }

    throw error;
  }
}

async function writeFileSnapshot(snapshot: CompileSandboxLaunchRequestSnapshot) {
  const filePath = getSandboxLaunchRequestFilePath();
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

async function readStoredRequests() {
  const mode = readSandboxLaunchStoreMode();
  if (mode === 'memory') {
    return Array.from(memoryStore.values());
  }

  if (mode === 'supabase') {
    const { data, error } = await getSupabase()
      .from('compile_sandbox_launch_requests')
      .select(SANDBOX_LAUNCH_REQUEST_SELECT)
      .order('created_at', { ascending: true })
      .overrideTypes<CompileSandboxLaunchRequestRow[], { merge: false }>();

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map(fromSupabaseRow);
  }

  return (await readFileSnapshot()).requests;
}

async function getStoredCompileSandboxLaunchRequest(launchRequestId: string) {
  if (readSandboxLaunchStoreMode() === 'supabase') {
    const { data, error } = await getSupabase()
      .from('compile_sandbox_launch_requests')
      .select(SANDBOX_LAUNCH_REQUEST_SELECT)
      .eq('launch_request_id', launchRequestId)
      .maybeSingle<CompileSandboxLaunchRequestRow>();

    if (error) {
      throw new Error(error.message);
    }

    return data ? fromSupabaseRow(data) : null;
  }

  const requests = await readStoredRequests();
  return requests.find(candidate => candidate.launchRequestId === launchRequestId) ?? null;
}

async function writeStoredRequests(requests: StoredCompileSandboxLaunchRequestRecord[]) {
  const mode = readSandboxLaunchStoreMode();
  if (mode === 'memory') {
    memoryStore.clear();
    for (const request of requests) {
      memoryStore.set(request.launchRequestId, request);
    }
    return;
  }

  if (mode === 'supabase') {
    throw new Error('Supabase sandbox launch request store does not support bulk rewrite.');
  }

  await writeFileSnapshot({ version: 1, requests });
}

export async function enqueueCompileSandboxLaunchRequest(input: {
  queueJobId: string;
  requestId: string;
  ownerKey: string;
  sourceCodeHash: string;
  sourceCodeLength: number;
  payload: CompileJobRequest;
}) {
  return withStoreLock(async () => {
    const createdAt = nowIso();
    const request: StoredCompileSandboxLaunchRequestRecord = {
      launchRequestId: randomUUID(),
      queueJobId: input.queueJobId,
      requestId: input.requestId,
      ownerKey: input.ownerKey,
      boardId: input.payload.boardId,
      requiredLibraries: [...input.payload.requiredLibraries],
      sourceCodeHash: input.sourceCodeHash,
      sourceCodeLength: input.sourceCodeLength,
      state: 'pending',
      createdAt,
      updatedAt: createdAt,
      payload: {
        jobId: input.payload.jobId,
        boardId: input.payload.boardId,
        sourceCode: input.payload.sourceCode,
        requiredLibraries: [...input.payload.requiredLibraries],
      },
    };

    if (readSandboxLaunchStoreMode() === 'supabase') {
      const { error } = await getSupabase()
        .from('compile_sandbox_launch_requests')
        .insert(toSupabaseRow(request));

      if (error) {
        throw new Error(error.message);
      }

      return toPublicRecord(request);
    }

    const requests = await readStoredRequests();
    requests.push(request);
    await writeStoredRequests(requests);
    return toPublicRecord(request);
  });
}

export async function getCompileSandboxLaunchRequest(launchRequestId: string) {
  const request = await getStoredCompileSandboxLaunchRequest(launchRequestId);
  return request ? toPublicRecord(request) : null;
}

function buildUpdatedLaunchRequest(
  existing: StoredCompileSandboxLaunchRequestRecord,
  patch: {
    state: CompileSandboxLaunchRequestState;
    latestResultId?: string;
    errorDetails?: string;
  }
) {
  const updatedAt = nowIso();

  return {
    ...existing,
    state: patch.state,
    latestResultId: patch.latestResultId ?? existing.latestResultId,
    updatedAt,
    errorDetails: patch.errorDetails ?? existing.errorDetails,
    claimedAt: patch.state === 'claimed' ? existing.claimedAt ?? updatedAt : existing.claimedAt,
    submittedAt:
      patch.state === 'submitted' ? existing.submittedAt ?? updatedAt : existing.submittedAt,
  };
}

export async function claimNextCompileSandboxLaunchRequest() {
  return withStoreLock(async () => {
    if (readSandboxLaunchStoreMode() === 'supabase') {
      const rpc = await getSupabase().rpc('claim_next_compile_sandbox_launch_request');
      if (!rpc.error && rpc.data) {
        return toClaimedRecord(fromSupabaseRow(rpc.data as CompileSandboxLaunchRequestRow));
      }
      if (rpc.error && !isMissingRpcFunction(rpc.error)) {
        throw new Error(rpc.error.message);
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data, error } = await getSupabase()
          .from('compile_sandbox_launch_requests')
          .select(SANDBOX_LAUNCH_REQUEST_SELECT)
          .eq('state', 'pending')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle<CompileSandboxLaunchRequestRow>();

        if (error) {
          throw new Error(error.message);
        }

        if (!data) {
          return null;
        }

        const claimed = buildUpdatedLaunchRequest(fromSupabaseRow(data), { state: 'claimed' });
        const { data: updated, error: updateError } = await getSupabase()
          .from('compile_sandbox_launch_requests')
          .update({
            state: claimed.state,
            latest_result_id: claimed.latestResultId ?? null,
            updated_at: claimed.updatedAt,
            claimed_at: claimed.claimedAt ?? null,
          })
          .eq('launch_request_id', claimed.launchRequestId)
          .eq('state', 'pending')
          .select(SANDBOX_LAUNCH_REQUEST_SELECT)
          .maybeSingle<CompileSandboxLaunchRequestRow>();

        if (updateError) {
          throw new Error(updateError.message);
        }

        if (updated) {
          return toClaimedRecord(fromSupabaseRow(updated));
        }
      }

      return null;
    }

    const requests = await readStoredRequests();
    const nextIndex = requests
      .map((request, index) => ({ request, index }))
      .filter(({ request }) => request.state === 'pending')
      .sort((left, right) => left.request.createdAt.localeCompare(right.request.createdAt))[0]?.index;

    if (nextIndex === undefined) {
      return null;
    }

    const claimed = buildUpdatedLaunchRequest(requests[nextIndex], { state: 'claimed' });
    requests[nextIndex] = claimed;
    await writeStoredRequests(requests);
    return toClaimedRecord(claimed);
  });
}

export async function updateCompileSandboxLaunchRequestState(
  launchRequestId: string,
  patch: {
    state: 'submitted' | 'failed';
    latestResultId?: string;
    errorDetails?: string;
  }
) {
  return withStoreLock(async () => {
    if (readSandboxLaunchStoreMode() === 'supabase') {
      const existing = await getStoredCompileSandboxLaunchRequest(launchRequestId);
      if (!existing) {
        return null;
      }

      const next = buildUpdatedLaunchRequest(existing, patch);
      const rpc = await getSupabase().rpc('update_compile_sandbox_launch_request_state', {
        p_launch_request_id: launchRequestId,
        p_state: next.state,
        p_latest_result_id: next.latestResultId ?? null,
        p_error_details: next.errorDetails ?? null,
      });
      if (!rpc.error && rpc.data) {
        return toPublicRecord(fromSupabaseRow(rpc.data as CompileSandboxLaunchRequestRow));
      }
      if (rpc.error && !isMissingRpcFunction(rpc.error)) {
        throw new Error(rpc.error.message);
      }

      const { data, error } = await getSupabase()
        .from('compile_sandbox_launch_requests')
        .update({
          state: next.state,
          latest_result_id: next.latestResultId ?? null,
          updated_at: next.updatedAt,
          claimed_at: next.claimedAt ?? null,
          submitted_at: next.submittedAt ?? null,
          error_details: next.errorDetails ?? null,
        })
        .eq('launch_request_id', launchRequestId)
        .select(SANDBOX_LAUNCH_REQUEST_SELECT)
        .maybeSingle<CompileSandboxLaunchRequestRow>();

      if (error) {
        throw new Error(error.message);
      }

      return data ? toPublicRecord(fromSupabaseRow(data)) : null;
    }

    const requests = await readStoredRequests();
    const index = requests.findIndex(candidate => candidate.launchRequestId === launchRequestId);
    if (index < 0) {
      return null;
    }

    const next = buildUpdatedLaunchRequest(requests[index], patch);
    requests[index] = next;
    await writeStoredRequests(requests);
    return toPublicRecord(next);
  });
}

export async function clearCompileSandboxLaunchRequestStore() {
  await withStoreLock(async () => {
    const mode = readSandboxLaunchStoreMode();
    if (mode === 'memory') {
      memoryStore.clear();
      return;
    }
    if (mode === 'supabase') {
      throw new Error('Refusing to clear the Supabase sandbox launch request store.');
    }

    await rm(getSandboxLaunchRequestFilePath(), { force: true });
  });
}
