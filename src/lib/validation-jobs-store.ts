import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { diffValidationSnapshots } from '@/lib/validation-snapshot';
import type {
  ProjectValidationSummary,
  ValidationIssueDiff,
  ValidationJobDetail,
  ValidationJobSummary,
  ValidationSnapshot,
} from '@/types';

type ValidationJobRow = {
  id: string;
  project_id: string;
  request_id: string | null;
  status: string;
  source_kind: 'kicad_import' | 'modumake_canvas';
  project_name: string;
  board_name: string | null;
  created_at: string | null;
  completed_at: string | null;
  validation_snapshot_id: string | null;
  validation_snapshot_version: number | null;
  issue_count: number;
  component_count: number;
  net_count: number;
  unresolved_symbol_count: number;
  failure_reason: string | null;
};

type ValidationSnapshotRow = {
  id: string;
  version: number;
  snapshot_json: ValidationSnapshot;
};

type ProjectValidationSummaryRow = {
  project_id: string;
  latest_validation_job_id: string | null;
  latest_validation_snapshot_id: string | null;
  main_validation_job_id: string | null;
  main_validation_snapshot_id: string | null;
  latest_issue_count: number | null;
  updated_at: string | null;
};

function getSupabase() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Supabase admin client is not configured.');
  }
  return supabase;
}

function toValidationJobSummary(row: ValidationJobRow): ValidationJobSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    sourceKind: row.source_kind,
    projectName: row.project_name,
    boardName: row.board_name,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    snapshotId: row.validation_snapshot_id,
    snapshotVersion: row.validation_snapshot_version,
    issueCount: row.issue_count,
    componentCount: row.component_count,
    netCount: row.net_count,
    unresolvedSymbolCount: row.unresolved_symbol_count,
  };
}

async function getSnapshotsByIds(snapshotIds: string[]) {
  if (snapshotIds.length === 0) {
    return new Map<string, ValidationSnapshot>();
  }

  const { data, error } = await getSupabase()
    .from('validation_snapshots')
    .select('id,version,snapshot_json')
    .in('id', snapshotIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as ValidationSnapshotRow[]).map(row => [row.id, row.snapshot_json])
  );
}

export async function getValidationJobDetail(jobId: string): Promise<ValidationJobDetail | null> {
  const { data, error } = await getSupabase()
    .from('validation_jobs')
    .select([
      'id',
      'project_id',
      'request_id',
      'status',
      'source_kind',
      'project_name',
      'board_name',
      'created_at',
      'completed_at',
      'validation_snapshot_id',
      'validation_snapshot_version',
      'issue_count',
      'component_count',
      'net_count',
      'unresolved_symbol_count',
      'failure_reason',
    ].join(','))
    .eq('id', jobId)
    .maybeSingle<ValidationJobRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const snapshots = await getSnapshotsByIds(data.validation_snapshot_id ? [data.validation_snapshot_id] : []);
  return {
    ...toValidationJobSummary(data),
    requestId: data.request_id,
    failureReason: data.failure_reason,
    snapshot: data.validation_snapshot_id ? (snapshots.get(data.validation_snapshot_id) ?? null) : null,
  };
}

export async function listProjectValidationJobs(projectId: string, limit = 10) {
  const { data, error } = await getSupabase()
    .from('validation_jobs')
    .select([
      'id',
      'project_id',
      'request_id',
      'status',
      'source_kind',
      'project_name',
      'board_name',
      'created_at',
      'completed_at',
      'validation_snapshot_id',
      'validation_snapshot_version',
      'issue_count',
      'component_count',
      'net_count',
      'unresolved_symbol_count',
      'failure_reason',
    ].join(','))
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as ValidationJobRow[]).map(toValidationJobSummary);
}

export async function getProjectValidationSummary(projectId: string): Promise<ProjectValidationSummary | null> {
  const { data, error } = await getSupabase()
    .from('project_validation_summaries')
    .select([
      'project_id',
      'latest_validation_job_id',
      'latest_validation_snapshot_id',
      'main_validation_job_id',
      'main_validation_snapshot_id',
      'latest_issue_count',
      'updated_at',
    ].join(','))
    .eq('project_id', projectId)
    .maybeSingle<ProjectValidationSummaryRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return {
    projectId: data.project_id,
    latestValidationJobId: data.latest_validation_job_id,
    latestValidationSnapshotId: data.latest_validation_snapshot_id,
    mainValidationJobId: data.main_validation_job_id,
    mainValidationSnapshotId: data.main_validation_snapshot_id,
    latestIssueCount: data.latest_issue_count ?? 0,
    updatedAt: data.updated_at,
  };
}

async function resolveBaselineJobId(
  projectId: string,
  currentJobId: string,
  baseline: string | null
) {
  if (!baseline || baseline === 'latest') {
    const jobs = await listProjectValidationJobs(projectId, 2);
    return jobs.find(job => job.id !== currentJobId)?.id ?? null;
  }

  if (baseline === 'main') {
    return (await getProjectValidationSummary(projectId))?.mainValidationJobId ?? null;
  }

  return baseline;
}

export async function getValidationJobDiff(
  jobId: string,
  baseline: string | null
): Promise<ValidationIssueDiff | null> {
  const current = await getValidationJobDetail(jobId);
  if (!current) {
    return null;
  }

  const baselineJobId = await resolveBaselineJobId(current.projectId, current.id, baseline);
  const baselineJob = baselineJobId ? await getValidationJobDetail(baselineJobId) : null;

  return diffValidationSnapshots({
    baselineJobId: baselineJob?.id ?? null,
    baselineSnapshotVersion: baselineJob?.snapshotVersion ?? null,
    currentJobId: current.id,
    currentSnapshotVersion: current.snapshotVersion ?? null,
    baselineSnapshot: baselineJob?.snapshot ?? null,
    currentSnapshot: current.snapshot ?? null,
  });
}
