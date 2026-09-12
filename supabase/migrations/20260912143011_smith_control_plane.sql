-- Smith control-plane metadata. Local-first; hosted application requires a
-- separate Production change review and explicit approval.

create schema if not exists smith_control;
revoke all on schema smith_control
from public, anon, authenticated, smith_test;
grant usage on schema smith_control to service_role;

create table smith_control.smith_work_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  source text not null,
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'error', 'critical')),
  status text not null default 'detected'
    check (status in (
      'detected', 'investigating', 'building', 'testing', 'preview_ready',
      'approval_requested', 'approved', 'deploying', 'deployed', 'rejected',
      'blocked', 'failed', 'superseded', 'verification_failed',
      'rollback_ready'
    )),
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high')),
  hypothesis text,
  diagnosis text,
  solution_summary text,
  branch_name text,
  commit_sha text check (commit_sha is null or commit_sha ~ '^[0-9a-f]{40}$'),
  current_preview_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table smith_control.smith_observations (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid references smith_control.smith_work_items(id)
    on delete set null,
  event_name text not null,
  source text not null,
  environment text not null
    check (environment in ('production', 'preview', 'test', 'local')),
  severity text not null
    check (severity in ('info', 'warning', 'error', 'critical', 'success')),
  title text not null,
  summary text not null default '',
  evidence jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  deduplication_key text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index smith_observations_deduplication_key_unique
on smith_control.smith_observations(deduplication_key)
where deduplication_key is not null;

create table smith_control.smith_previews (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references smith_control.smith_work_items(id)
    on delete cascade,
  provider text not null,
  status text not null default 'preparing'
    check (status in (
      'preparing', 'building', 'testing', 'ready', 'failed', 'superseded',
      'disconnected'
    )),
  branch_name text not null,
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  deployment_id text,
  url text,
  screenshot_path text,
  is_stale boolean not null default false,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  superseded_at timestamptz
);

alter table smith_control.smith_work_items
add constraint smith_work_items_current_preview_fk
foreign key (current_preview_id)
references smith_control.smith_previews(id)
on delete set null;

create table smith_control.smith_test_runs (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references smith_control.smith_work_items(id)
    on delete cascade,
  preview_id uuid references smith_control.smith_previews(id)
    on delete set null,
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'passed', 'failed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  is_stale boolean not null default false,
  created_at timestamptz not null default now()
);

create table smith_control.smith_test_results (
  id uuid primary key default gen_random_uuid(),
  test_run_id uuid not null references smith_control.smith_test_runs(id)
    on delete cascade,
  suite text not null,
  status text not null check (status in ('passed', 'failed', 'skipped')),
  assertions_passed integer not null default 0 check (assertions_passed >= 0),
  assertions_failed integer not null default 0 check (assertions_failed >= 0),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table smith_control.smith_approvals (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references smith_control.smith_work_items(id)
    on delete cascade,
  preview_id uuid not null references smith_control.smith_previews(id)
    on delete restrict,
  test_run_id uuid not null references smith_control.smith_test_runs(id)
    on delete restrict,
  exact_sha text not null check (exact_sha ~ '^[0-9a-f]{40}$'),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'superseded')),
  requested_by uuid,
  requested_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  manual_qa_at timestamptz,
  risk_summary jsonb not null default '{}'::jsonb,
  is_stale boolean not null default false
);

create table smith_control.smith_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_type text not null,
  actor_id text,
  environment text not null,
  target_type text not null,
  target_id text,
  work_item_id uuid references smith_control.smith_work_items(id)
    on delete set null,
  branch_name text,
  commit_sha text check (commit_sha is null or commit_sha ~ '^[0-9a-f]{40}$'),
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table smith_control.smith_chat_threads (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  title text not null default 'שיחה עם Smith',
  work_item_id uuid references smith_control.smith_work_items(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table smith_control.smith_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references smith_control.smith_chat_threads(id)
    on delete cascade,
  role text not null check (role in ('admin', 'smith', 'system')),
  content text not null,
  capability text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table smith_control.smith_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  work_item_id uuid references smith_control.smith_work_items(id)
    on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in (
      'queued', 'running', 'completed', 'failed', 'cancelled', 'blocked'
    )),
  idempotency_key text not null unique,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  lease_owner text,
  lease_expires_at timestamptz,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table smith_control.smith_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into smith_control.smith_settings(key, value)
values
  ('kill_switch', '{"active":true,"reason":"Smith runner is not connected"}'),
  ('max_autonomous_iterations', '{"value":3}')
on conflict (key) do nothing;

create table smith_control.smith_production_authorizations (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references smith_control.smith_work_items(id)
    on delete restrict,
  approval_id uuid not null references smith_control.smith_approvals(id)
    on delete restrict,
  admin_user_id uuid not null,
  operation text not null,
  exact_sha text not null check (exact_sha ~ '^[0-9a-f]{40}$'),
  token_digest text not null unique,
  status text not null default 'disconnected'
    check (status in (
      'disconnected', 'issued', 'consumed', 'expired', 'revoked'
    )),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at <= created_at + interval '5 minutes')
);

create or replace function smith_control.work_item_transition_allowed(
  previous_status text,
  next_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    previous_status = next_status
    or (previous_status, next_status) in (
      ('detected', 'investigating'),
      ('detected', 'blocked'),
      ('investigating', 'building'),
      ('investigating', 'blocked'),
      ('investigating', 'failed'),
      ('building', 'testing'),
      ('building', 'blocked'),
      ('building', 'failed'),
      ('testing', 'building'),
      ('testing', 'preview_ready'),
      ('testing', 'failed'),
      ('preview_ready', 'building'),
      ('preview_ready', 'approval_requested'),
      ('preview_ready', 'superseded'),
      ('approval_requested', 'approved'),
      ('approval_requested', 'rejected'),
      ('approval_requested', 'superseded'),
      ('approved', 'deploying'),
      ('approved', 'superseded'),
      ('deploying', 'deployed'),
      ('deploying', 'failed'),
      ('deployed', 'verification_failed'),
      ('verification_failed', 'rollback_ready'),
      ('rejected', 'building'),
      ('blocked', 'investigating'),
      ('failed', 'investigating')
    );
$$;

create or replace function smith_control.enforce_work_item_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not smith_control.work_item_transition_allowed(old.status, new.status) then
    raise exception 'invalid_work_item_transition:%->%', old.status, new.status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger enforce_smith_work_item_transition
before update of status on smith_control.smith_work_items
for each row execute function smith_control.enforce_work_item_transition();

create or replace function smith_control.invalidate_stale_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.commit_sha is distinct from new.commit_sha and new.commit_sha is not null then
    update smith_control.smith_previews
    set is_stale = true,
        status = case when status = 'ready' then 'superseded' else status end,
        superseded_at = case when status = 'ready' then now() else superseded_at end
    where work_item_id = new.id and commit_sha is distinct from new.commit_sha;

    update smith_control.smith_test_runs
    set is_stale = true
    where work_item_id = new.id and commit_sha is distinct from new.commit_sha;

    update smith_control.smith_approvals
    set is_stale = true,
        status = 'superseded'
    where work_item_id = new.id
      and exact_sha is distinct from new.commit_sha
      and status in ('requested', 'approved');
  end if;
  return new;
end;
$$;

create trigger invalidate_smith_stale_evidence
after update of commit_sha on smith_control.smith_work_items
for each row execute function smith_control.invalidate_stale_evidence();

create or replace function smith_control.claim_job(
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns setof smith_control.smith_jobs
language sql
set search_path = ''
as $$
  with candidate as (
    select id
    from smith_control.smith_jobs
    where status = 'queued'
      and scheduled_at <= now()
      and attempts < max_attempts
      and (
        lease_expires_at is null
        or lease_expires_at < now()
      )
    order by scheduled_at, created_at
    for update skip locked
    limit 1
  )
  update smith_control.smith_jobs as jobs
  set status = 'running',
      attempts = jobs.attempts + 1,
      lease_owner = p_worker_id,
      lease_expires_at = now() + make_interval(secs => greatest(10, p_lease_seconds)),
      started_at = coalesce(jobs.started_at, now()),
      updated_at = now()
  from candidate
  where jobs.id = candidate.id
  returning jobs.*;
$$;

create index smith_work_items_status_updated_idx
on smith_control.smith_work_items(status, updated_at desc);
create index smith_observations_observed_idx
on smith_control.smith_observations(observed_at desc);
create index smith_previews_work_item_created_idx
on smith_control.smith_previews(work_item_id, created_at desc);
create index smith_test_runs_work_item_created_idx
on smith_control.smith_test_runs(work_item_id, created_at desc);
create index smith_audit_created_idx
on smith_control.smith_audit_log(created_at desc);
create index smith_jobs_claim_idx
on smith_control.smith_jobs(status, scheduled_at)
where status = 'queued';

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'smith_work_items',
    'smith_observations',
    'smith_previews',
    'smith_test_runs',
    'smith_test_results',
    'smith_approvals',
    'smith_audit_log',
    'smith_chat_threads',
    'smith_chat_messages',
    'smith_jobs',
    'smith_settings',
    'smith_production_authorizations'
  ]
  loop
    execute format(
      'alter table smith_control.%I enable row level security',
      table_name
    );
    execute format(
      'alter table smith_control.%I force row level security',
      table_name
    );
    execute format(
      'revoke all on smith_control.%I from public, anon, authenticated, smith_test',
      table_name
    );
    execute format(
      'grant select, insert, update, delete on smith_control.%I to service_role',
      table_name
    );
  end loop;
end
$$;

revoke execute on all functions in schema smith_control
from public, anon, authenticated, smith_test;
grant execute on function smith_control.claim_job(text, integer)
to service_role;
grant execute on function smith_control.work_item_transition_allowed(text, text)
to service_role;
