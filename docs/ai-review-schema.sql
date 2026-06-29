-- ModuMake v3 validation / AI review schema draft
-- 목적:
-- 1) `.kicad_sch + code` 기반 검증 실행 단위를 저장한다.
-- 2) integrated validation JSON 전체 스냅샷을 재현 가능하게 보존한다.
-- 3) 주요 하위 엔티티를 정규화해서 검색 / 통계 / 리포트에 쓸 수 있게 한다.
--
-- 주의:
-- - 이 파일은 기존 docs/supabase_schema.sql을 즉시 대체하는 문서가 아니라
--   v3 검증 파이프라인용 별도 초안이다.
-- - `public.projects`는 기존 앱 테이블을 재사용하며, 필요한 컬럼만 확장한다.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_tier text not null default 'free' check (plan_tier in ('free', 'pro', 'edu', 'enterprise')),
  billing_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  label text not null,
  key_prefix text not null,
  key_hash text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  endpoint text not null,
  model_name text,
  request_count integer not null default 1,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  response_ms integer,
  status text not null default 'ok' check (status in ('ok', 'error', 'rate_limited')),
  created_at timestamptz not null default now()
);

alter table public.projects
  add column if not exists account_id uuid references public.accounts(id) on delete set null,
  add column if not exists source_kind text not null default 'modumake_canvas'
    check (source_kind in ('modumake_canvas', 'kicad_import', 'validation_only'));

create table if not exists public.code_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  language text not null check (language in ('c', 'cpp', 'ino', 'python', 'other')),
  file_name text,
  source_sha256 text,
  source_code text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.part_master (
  id uuid primary key default gen_random_uuid(),
  canonical_mpn text not null unique,
  manufacturer_name text,
  normalized_part_name text,
  datasheet_url text,
  lifecycle_status text,
  source_quality text,
  alias_names text[] not null default '{}',
  supporting_urls text[] not null default '{}',
  pin_schema_json jsonb not null default '{}'::jsonb,
  specs_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.validation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  request_id text,
  code_artifact_id uuid references public.code_artifacts(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'parsing', 'analyzing', 'completed', 'failed')),
  source_kind text not null check (source_kind in ('kicad_import', 'modumake_canvas')),
  validation_snapshot_id uuid,
  validation_snapshot_version integer,
  schema_version text not null,
  project_name text not null,
  board_id text,
  board_name text,
  logic_voltage text,
  imported_component_count integer not null default 0,
  imported_connection_count integer not null default 0,
  generated_custom_component_count integer not null default 0,
  component_count integer not null default 0,
  net_count integer not null default 0,
  issue_count integer not null default 0,
  unresolved_symbol_count integer not null default 0,
  board_net_labels text[] not null default '{}',
  board_pin_names text[] not null default '{}',
  validation_input_json jsonb not null default '{}'::jsonb,
  integrated_model_json jsonb not null default '{}'::jsonb,
  validation_flags_json jsonb not null default '[]'::jsonb,
  rule_findings_json jsonb not null default '[]'::jsonb,
  extraction_plan_json jsonb not null default '{}'::jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.validation_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  schema_version text not null,
  validation_input_schema_version text not null,
  source_kind text not null check (source_kind in ('kicad_import', 'modumake_canvas')),
  project_name text not null,
  board_id text,
  board_name text,
  logic_voltage text,
  issue_count integer not null default 0,
  error_count integer not null default 0,
  warning_count integer not null default 0,
  info_count integer not null default 0,
  snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

alter table public.validation_jobs
  add constraint validation_jobs_validation_snapshot_id_fkey
  foreign key (validation_snapshot_id) references public.validation_snapshots(id) on delete set null;

create table if not exists public.validation_nets (
  id uuid primary key default gen_random_uuid(),
  validation_job_id uuid not null references public.validation_jobs(id) on delete cascade,
  net_id text not null,
  label text,
  kind text not null check (kind in ('power', 'ground', 'signal', 'clock', 'bus', 'analog', 'unknown')),
  aliases text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (validation_job_id, net_id)
);

create table if not exists public.validation_net_members (
  id uuid primary key default gen_random_uuid(),
  validation_net_id uuid not null references public.validation_nets(id) on delete cascade,
  owner_type text not null check (owner_type in ('board', 'component')),
  owner_id text not null,
  owner_reference text,
  pin_id text not null,
  pin_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.component_instances (
  id uuid primary key default gen_random_uuid(),
  validation_job_id uuid not null references public.validation_jobs(id) on delete cascade,
  matched_part_id uuid references public.part_master(id) on delete set null,
  instance_id text not null,
  refdes text not null,
  display_name text,
  category text,
  source_kind text,
  template_id text,
  lib_id text not null,
  symbol_name text,
  reference_prefix text,
  value text,
  footprint text,
  mpn_candidates text[] not null default '{}',
  manufacturer_candidates text[] not null default '{}',
  tags text[] not null default '{}',
  pin_names text[] not null default '{}',
  net_labels text[] not null default '{}',
  connected_net_ids text[] not null default '{}',
  pin_net_map jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (validation_job_id, instance_id)
);

create table if not exists public.code_pin_usages (
  id uuid primary key default gen_random_uuid(),
  validation_job_id uuid not null references public.validation_jobs(id) on delete cascade,
  operation_type text not null
    check (operation_type in ('pinMode', 'digitalWrite', 'analogWrite', 'digitalRead', 'analogRead')),
  pin_argument text not null,
  matched_mcu_pin_label text,
  line_number integer,
  scope text not null check (scope in ('setup', 'loop', 'other')),
  mode text,
  value text,
  conditional boolean not null default false,
  conditions_json jsonb not null default '[]'::jsonb,
  call_path_json jsonb not null default '[]'::jsonb,
  connected_net_labels text[] not null default '{}',
  connected_component_references text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.error_findings (
  id uuid primary key default gen_random_uuid(),
  validation_job_id uuid not null references public.validation_jobs(id) on delete cascade,
  component_instance_id uuid references public.component_instances(id) on delete set null,
  validation_net_id uuid references public.validation_nets(id) on delete set null,
  source_engine text not null check (source_engine in ('rule_based', 'formal_verifier', 'datasheet_ai')),
  severity text not null check (severity in ('info', 'warning', 'error')),
  finding_code text not null,
  rule_id text,
  title text not null,
  message text not null,
  board_pin text,
  net_label text,
  line_number integer,
  operation text,
  recommendation text,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.validation_extraction_targets (
  id uuid primary key default gen_random_uuid(),
  validation_job_id uuid not null references public.validation_jobs(id) on delete cascade,
  reference text not null,
  display_name text not null,
  library_id text,
  footprint text,
  mpn_candidates text[] not null default '{}',
  manufacturer_candidates text[] not null default '{}',
  requested_sections text[] not null default '{}',
  search_queries text[] not null default '{}',
  review_questions text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.substitute_suggestions (
  id uuid primary key default gen_random_uuid(),
  error_finding_id uuid not null references public.error_findings(id) on delete cascade,
  suggested_part_id uuid references public.part_master(id) on delete set null,
  suggested_mpn text,
  source_api text,
  compatibility_score numeric(5, 2),
  reason text,
  purchase_url text,
  raw_vendor_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.issue_resolutions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  validation_snapshot_id uuid references public.validation_snapshots(id) on delete set null,
  issue_fingerprint text not null,
  status text not null check (status in ('open', 'resolved', 'accepted-risk', 'false-positive')),
  resolution_note text,
  resolved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rule_quality_metrics (
  id uuid primary key default gen_random_uuid(),
  rule_id text not null,
  source_engine text not null check (source_engine in ('rule_based', 'formal_verifier', 'datasheet_ai')),
  project_id uuid references public.projects(id) on delete cascade,
  validation_snapshot_id uuid references public.validation_snapshots(id) on delete cascade,
  issue_fingerprint text not null,
  outcome text not null check (outcome in ('true_positive', 'false_positive', 'resolved', 'suppressed')),
  confidence text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_validation_summaries (
  project_id uuid primary key references public.projects(id) on delete cascade,
  latest_validation_job_id uuid references public.validation_jobs(id) on delete set null,
  latest_validation_snapshot_id uuid references public.validation_snapshots(id) on delete set null,
  main_validation_job_id uuid references public.validation_jobs(id) on delete set null,
  main_validation_snapshot_id uuid references public.validation_snapshots(id) on delete set null,
  latest_issue_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_account_id on public.projects(account_id);
create index if not exists idx_code_artifacts_project_created on public.code_artifacts(project_id, created_at desc);
create index if not exists idx_validation_jobs_project_created on public.validation_jobs(project_id, created_at desc);
create index if not exists idx_validation_jobs_status on public.validation_jobs(status);
create index if not exists idx_validation_jobs_board on public.validation_jobs(board_id);
create index if not exists idx_validation_jobs_validation_input_gin on public.validation_jobs using gin (validation_input_json);
create index if not exists idx_validation_jobs_integrated_model_gin on public.validation_jobs using gin (integrated_model_json);
create index if not exists idx_validation_jobs_snapshot on public.validation_jobs(validation_snapshot_id);
create index if not exists idx_validation_snapshots_project_version on public.validation_snapshots(project_id, version desc);
create index if not exists idx_validation_snapshots_snapshot_gin on public.validation_snapshots using gin (snapshot_json);
create index if not exists idx_validation_nets_job on public.validation_nets(validation_job_id);
create index if not exists idx_validation_nets_label on public.validation_nets(label);
create index if not exists idx_validation_net_members_net on public.validation_net_members(validation_net_id);
create index if not exists idx_component_instances_job on public.component_instances(validation_job_id);
create index if not exists idx_component_instances_matched_part on public.component_instances(matched_part_id);
create index if not exists idx_component_instances_refdes on public.component_instances(refdes);
create index if not exists idx_component_instances_pin_net_map_gin on public.component_instances using gin (pin_net_map);
create index if not exists idx_code_pin_usages_job_pin on public.code_pin_usages(validation_job_id, pin_argument);
create index if not exists idx_error_findings_job_severity on public.error_findings(validation_job_id, severity);
create index if not exists idx_error_findings_component on public.error_findings(component_instance_id);
create index if not exists idx_error_findings_code on public.error_findings(finding_code);
create index if not exists idx_validation_extraction_targets_job on public.validation_extraction_targets(validation_job_id);
create index if not exists idx_part_master_canonical_mpn on public.part_master(canonical_mpn);
create index if not exists idx_part_master_name_trgm on public.part_master using gin (normalized_part_name gin_trgm_ops);
create index if not exists idx_api_keys_account on public.api_keys(account_id);
create index if not exists idx_api_usage_logs_key_created on public.api_usage_logs(api_key_id, created_at desc);
create index if not exists idx_issue_resolutions_project_issue on public.issue_resolutions(project_id, issue_fingerprint);
create index if not exists idx_rule_quality_metrics_rule_created on public.rule_quality_metrics(rule_id, created_at desc);

alter table public.accounts enable row level security;
alter table public.api_keys enable row level security;
alter table public.api_usage_logs enable row level security;
alter table public.code_artifacts enable row level security;
alter table public.part_master enable row level security;
alter table public.validation_jobs enable row level security;
alter table public.validation_snapshots enable row level security;
alter table public.validation_nets enable row level security;
alter table public.validation_net_members enable row level security;
alter table public.component_instances enable row level security;
alter table public.code_pin_usages enable row level security;
alter table public.error_findings enable row level security;
alter table public.issue_resolutions enable row level security;
alter table public.rule_quality_metrics enable row level security;
alter table public.project_validation_summaries enable row level security;
alter table public.validation_extraction_targets enable row level security;
alter table public.substitute_suggestions enable row level security;

-- Phase 1: all new v3 validation tables are server-managed.
-- Open read policies can be added later once project/account ACL is finalized.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts',
    'api_keys',
    'api_usage_logs',
    'code_artifacts',
    'part_master',
    'validation_jobs',
    'validation_nets',
    'validation_net_members',
    'component_instances',
    'code_pin_usages',
    'error_findings',
    'validation_extraction_targets',
    'substitute_suggestions'
  ]
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = table_name || ' server managed'
    ) then
      execute format(
        'create policy %I on public.%I for all using (false) with check (false)',
        table_name || ' server managed',
        table_name
      );
    end if;
  end loop;
end $$;
