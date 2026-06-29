create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

create table if not exists public.components (
  id varchar(255) primary key,
  name varchar(255) not null,
  category varchar(50) not null check (category in ('SENSOR', 'ACTUATOR', 'DISPLAY', 'COMMUNICATION', 'PASSIVE')),
  description text,
  icon varchar(100),
  compatible_voltage varchar(20) not null default 'BOTH' check (compatible_voltage in ('BOTH', '5V', '3.3V')),
  required_pins jsonb not null,
  library_includes text[] not null default '{}',
  simulation_model jsonb,
  schematic_model jsonb,
  pcb_model jsonb,
  dependencies jsonb,
  ai_hints jsonb,
  design jsonb,
  code jsonb,
  library_source varchar(50) not null default 'core',
  default_value varchar(100),
  datasheet_status varchar(50),
  popularity_rank integer,
  package_version varchar(50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_components_category on public.components(category);
create index if not exists idx_components_name on public.components(name);
create index if not exists idx_components_name_trgm on public.components using gin (name gin_trgm_ops);
create index if not exists idx_components_description_trgm on public.components using gin (description gin_trgm_ops);
create index if not exists idx_components_required_pins on public.components using gin (required_pins);
create index if not exists idx_components_popularity_rank on public.components(popularity_rank asc nulls last);

create table if not exists public.arduino_libraries (
  name varchar(255) primary key,
  author varchar(255),
  sentence text,
  paragraph text,
  category varchar(100),
  includes text[] not null default '{}',
  latest_version varchar(50),
  repository_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_arduino_libraries_name on public.arduino_libraries(name);
create index if not exists idx_arduino_libraries_name_trgm on public.arduino_libraries using gin (name gin_trgm_ops);
create index if not exists idx_arduino_libraries_sentence_trgm on public.arduino_libraries using gin (sentence gin_trgm_ops);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null default 'Untitled Project',
  state_json jsonb not null default '{}'::jsonb,
  visibility text not null default 'unlisted' check (visibility in ('private', 'unlisted', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_updated_at on public.projects(updated_at desc);
create index if not exists idx_projects_visibility on public.projects(visibility);

create table if not exists public.validation_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  schema_version text not null,
  snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create table if not exists public.project_validation_summaries (
  project_id uuid primary key references public.projects(id) on delete cascade,
  latest_validation_job_id uuid,
  latest_validation_snapshot_id uuid references public.validation_snapshots(id) on delete set null,
  main_validation_job_id uuid,
  main_validation_snapshot_id uuid references public.validation_snapshots(id) on delete set null,
  latest_issue_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.issue_resolutions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  validation_snapshot_id uuid references public.validation_snapshots(id) on delete set null,
  issue_fingerprint text not null,
  status text not null check (status in ('open', 'resolved', 'accepted-risk', 'false-positive')),
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rule_quality_metrics (
  id uuid primary key default gen_random_uuid(),
  rule_id text not null,
  project_id uuid references public.projects(id) on delete cascade,
  validation_snapshot_id uuid references public.validation_snapshots(id) on delete cascade,
  issue_fingerprint text not null,
  outcome text not null check (outcome in ('true_positive', 'false_positive', 'resolved', 'suppressed')),
  created_at timestamptz not null default now()
);

create table if not exists public.compile_queue_jobs (
  queue_job_id uuid primary key,
  request_id text not null,
  owner_key text not null,
  board_id text not null,
  required_libraries text[] not null default '{}',
  source_code_hash text not null,
  source_code_length integer not null,
  state text not null check (state in ('queued', 'dispatching', 'running', 'succeeded', 'failed')),
  latest_result_id uuid,
  payload_json jsonb not null,
  build_logs text,
  error_details text,
  hex_binary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_compile_queue_jobs_state_created_at
  on public.compile_queue_jobs(state, created_at asc);
create index if not exists idx_compile_queue_jobs_owner_created_at
  on public.compile_queue_jobs(owner_key, created_at desc);

create table if not exists public.compile_sandbox_launch_requests (
  launch_request_id uuid primary key,
  queue_job_id uuid not null references public.compile_queue_jobs(queue_job_id) on delete cascade,
  request_id text not null,
  owner_key text not null,
  board_id text not null,
  required_libraries text[] not null default '{}',
  source_code_hash text not null,
  source_code_length integer not null,
  state text not null check (state in ('pending', 'claimed', 'submitted', 'failed')),
  latest_result_id uuid,
  payload_json jsonb not null,
  error_details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,
  submitted_at timestamptz
);

create index if not exists idx_compile_sandbox_launch_requests_state_created_at
  on public.compile_sandbox_launch_requests(state, created_at asc);
create index if not exists idx_compile_sandbox_launch_requests_queue_job_id
  on public.compile_sandbox_launch_requests(queue_job_id);

create table if not exists public.compile_execution_results (
  result_id uuid primary key,
  launch_request_id uuid not null references public.compile_sandbox_launch_requests(launch_request_id) on delete cascade,
  queue_job_id uuid not null references public.compile_queue_jobs(queue_job_id) on delete cascade,
  state text not null check (state in ('running', 'succeeded', 'failed')),
  primary_artifact_id uuid,
  build_logs text,
  error_details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_compile_execution_results_queue_job_created_at
  on public.compile_execution_results(queue_job_id, created_at desc);
create index if not exists idx_compile_execution_results_launch_request_id
  on public.compile_execution_results(launch_request_id);

create table if not exists public.compile_artifacts (
  artifact_id uuid primary key,
  result_id uuid not null references public.compile_execution_results(result_id) on delete cascade,
  kind text not null check (kind in ('hex')),
  size_bytes integer not null,
  storage_backend text not null check (storage_backend in ('memory-inline', 'file-object', 'supabase-storage')),
  storage_object_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_compile_artifacts_result_id
  on public.compile_artifacts(result_id);

create or replace function public.claim_next_compile_queue_job()
returns public.compile_queue_jobs
language plpgsql
security definer
as $$
declare
  claimed public.compile_queue_jobs;
begin
  with next_job as (
    select queue_job_id
    from public.compile_queue_jobs
    where state = 'queued'
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.compile_queue_jobs queue_jobs
  set
    state = 'dispatching',
    updated_at = now(),
    started_at = coalesce(queue_jobs.started_at, now())
  from next_job
  where queue_jobs.queue_job_id = next_job.queue_job_id
  returning queue_jobs.* into claimed;

  return claimed;
end;
$$;

create or replace function public.update_compile_queue_job_state(
  p_queue_job_id uuid,
  p_state text,
  p_latest_result_id uuid default null,
  p_build_logs text default null,
  p_error_details text default null,
  p_hex_binary text default null
)
returns public.compile_queue_jobs
language plpgsql
security definer
as $$
declare
  updated public.compile_queue_jobs;
begin
  update public.compile_queue_jobs
  set
    state = p_state,
    latest_result_id = coalesce(p_latest_result_id, latest_result_id),
    build_logs = coalesce(p_build_logs, build_logs),
    error_details = coalesce(p_error_details, error_details),
    hex_binary = coalesce(p_hex_binary, hex_binary),
    updated_at = now(),
    started_at = case
      when p_state in ('dispatching', 'running') then coalesce(started_at, now())
      else started_at
    end,
    completed_at = case
      when p_state in ('succeeded', 'failed') then now()
      else completed_at
    end
  where queue_job_id = p_queue_job_id
  returning * into updated;

  return updated;
end;
$$;

create or replace function public.claim_next_compile_sandbox_launch_request()
returns public.compile_sandbox_launch_requests
language plpgsql
security definer
as $$
declare
  claimed public.compile_sandbox_launch_requests;
begin
  with next_request as (
    select launch_request_id
    from public.compile_sandbox_launch_requests
    where state = 'pending'
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.compile_sandbox_launch_requests requests
  set
    state = 'claimed',
    updated_at = now(),
    claimed_at = coalesce(requests.claimed_at, now())
  from next_request
  where requests.launch_request_id = next_request.launch_request_id
  returning requests.* into claimed;

  return claimed;
end;
$$;

create or replace function public.update_compile_sandbox_launch_request_state(
  p_launch_request_id uuid,
  p_state text,
  p_latest_result_id uuid default null,
  p_error_details text default null
)
returns public.compile_sandbox_launch_requests
language plpgsql
security definer
as $$
declare
  updated public.compile_sandbox_launch_requests;
begin
  update public.compile_sandbox_launch_requests
  set
    state = p_state,
    latest_result_id = coalesce(p_latest_result_id, latest_result_id),
    error_details = coalesce(p_error_details, error_details),
    updated_at = now(),
    claimed_at = case
      when p_state = 'claimed' then coalesce(claimed_at, now())
      else claimed_at
    end,
    submitted_at = case
      when p_state = 'submitted' then coalesce(submitted_at, now())
      else submitted_at
    end
  where launch_request_id = p_launch_request_id
  returning * into updated;

  return updated;
end;
$$;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  content text not null,
  target_type text not null check (target_type in ('canvas_coord', 'node', 'wire', 'code_line')),
  target_meta jsonb not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'orphaned')),
  parent_id uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_comments_project_created_at on public.comments(project_id, created_at desc);
create index if not exists idx_comments_project_status on public.comments(project_id, status);
create index if not exists idx_comments_parent_id on public.comments(parent_id);

alter table public.components enable row level security;
alter table public.arduino_libraries enable row level security;
alter table public.projects enable row level security;
alter table public.comments enable row level security;
alter table public.compile_queue_jobs enable row level security;
alter table public.compile_sandbox_launch_requests enable row level security;
alter table public.compile_execution_results enable row level security;
alter table public.compile_artifacts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'components'
      and policyname = 'Allow public read access on components'
  ) then
    create policy "Allow public read access on components"
      on public.components
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'compile_execution_results'
      and policyname = 'Compile execution results are managed through server routes'
  ) then
    create policy "Compile execution results are managed through server routes"
      on public.compile_execution_results
      for all
      using (false)
      with check (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'compile_artifacts'
      and policyname = 'Compile artifacts are managed through server routes'
  ) then
    create policy "Compile artifacts are managed through server routes"
      on public.compile_artifacts
      for all
      using (false)
      with check (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'compile_sandbox_launch_requests'
      and policyname = 'Sandbox launch requests are managed through server routes'
  ) then
    create policy "Sandbox launch requests are managed through server routes"
      on public.compile_sandbox_launch_requests
      for all
      using (false)
      with check (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'compile_queue_jobs'
      and policyname = 'Compile queue jobs are managed through server routes'
  ) then
    create policy "Compile queue jobs are managed through server routes"
      on public.compile_queue_jobs
      for all
      using (false)
      with check (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'comments'
      and policyname = 'Comments are managed through server routes'
  ) then
    create policy "Comments are managed through server routes"
      on public.comments
      for all
      using (false)
      with check (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'Users can manage their own projects'
  ) then
    create policy "Users can manage their own projects"
      on public.projects
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'Anyone can view unlisted or public projects'
  ) then
    create policy "Anyone can view unlisted or public projects"
      on public.projects
      for select
      using (visibility in ('unlisted', 'public'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'Guests can create projects'
  ) then
    create policy "Guests can create projects"
      on public.projects
      for insert
      with check (user_id is null or user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'arduino_libraries'
      and policyname = 'Allow public read access on libraries'
  ) then
    create policy "Allow public read access on libraries"
      on public.arduino_libraries
      for select
      using (true);
  end if;
end $$;
