-- Play release domain: phone, household, day_plan SoT, calendar (encrypted tokens),
-- durable jobs, telemetry events. Production: self-hosted VPS only.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Phone (optional, no enumeration index on raw lookup APIs)
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists phone_e164 text
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

-- ---------------------------------------------------------------------------
-- Household (couple V1, max 2 members)
-- ---------------------------------------------------------------------------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  title text not null default 'הבית',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create unique index if not exists household_members_one_household_per_user
  on public.household_members (user_id);

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function private.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_household_member(uuid) from public, anon, authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

drop policy if exists households_member_select on public.households;
create policy households_member_select on public.households
  for select to authenticated
  using (private.is_household_member(id));

drop policy if exists households_owner_update on public.households;
create policy households_owner_update on public.households
  for update to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists households_insert_own on public.households;
create policy households_insert_own on public.households
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists household_members_select on public.household_members;
create policy household_members_select on public.household_members
  for select to authenticated
  using (private.is_household_member(household_id) or user_id = (select auth.uid()));

drop policy if exists household_invites_member_select on public.household_invites;
create policy household_invites_member_select on public.household_invites
  for select to authenticated
  using (private.is_household_member(household_id));

revoke all on table public.households, public.household_members, public.household_invites
  from anon, authenticated;
grant select, insert, update on table public.households to authenticated;
grant select on table public.household_members to authenticated;
grant select, insert, update on table public.household_invites to authenticated;

-- Shared ownership columns on existing UGC
alter table public.tasks add column if not exists household_id uuid references public.households(id) on delete set null;
alter table public.shopping_items add column if not exists household_id uuid references public.households(id) on delete set null;
alter table public.checklists add column if not exists household_id uuid references public.households(id) on delete set null;

create index if not exists tasks_household_id_idx on public.tasks (household_id);
create index if not exists shopping_items_household_id_idx on public.shopping_items (household_id);
create index if not exists checklists_household_id_idx on public.checklists (household_id);

-- Widen task RLS: own rows OR household shared
drop policy if exists "tasks_select_own" on public.tasks;
drop policy if exists tasks_select_own on public.tasks;
do $$
begin
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='tasks' and policyname='Users can read own tasks'
  ) then
    execute 'drop policy "Users can read own tasks" on public.tasks';
  end if;
end $$;

-- Keep existing policies; add household overlay policies
drop policy if exists tasks_household_select on public.tasks;
create policy tasks_household_select on public.tasks
  for select to authenticated
  using (
    household_id is not null and private.is_household_member(household_id)
  );

drop policy if exists shopping_household_select on public.shopping_items;
create policy shopping_household_select on public.shopping_items
  for select to authenticated
  using (
    household_id is not null and private.is_household_member(household_id)
  );

drop policy if exists checklists_household_select on public.checklists;
create policy checklists_household_select on public.checklists
  for select to authenticated
  using (
    household_id is not null and private.is_household_member(household_id)
  );

-- ---------------------------------------------------------------------------
-- day_plan — sole schedule source of truth
-- ---------------------------------------------------------------------------
create table if not exists public.day_plans (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('user', 'household')),
  scope_id uuid not null,
  plan_date date not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_type, scope_id, plan_date)
);

create table if not exists public.day_plan_items (
  id uuid primary key default gen_random_uuid(),
  day_plan_id uuid not null references public.day_plans(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz,
  kind text not null check (kind in ('fixed', 'flexible')),
  source text not null check (source in ('manual', 'replan', 'calendar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists day_plan_items_plan_idx on public.day_plan_items (day_plan_id);
create index if not exists day_plan_items_task_idx on public.day_plan_items (task_id);

alter table public.day_plans enable row level security;
alter table public.day_plan_items enable row level security;

drop policy if exists day_plans_select on public.day_plans;
create policy day_plans_select on public.day_plans
  for select to authenticated
  using (
    (scope_type = 'user' and scope_id = (select auth.uid()))
    or (scope_type = 'household' and private.is_household_member(scope_id))
  );

drop policy if exists day_plans_write on public.day_plans;
create policy day_plans_write on public.day_plans
  for all to authenticated
  using (
    (scope_type = 'user' and scope_id = (select auth.uid()))
    or (scope_type = 'household' and private.is_household_member(scope_id))
  )
  with check (
    (scope_type = 'user' and scope_id = (select auth.uid()))
    or (scope_type = 'household' and private.is_household_member(scope_id))
  );

drop policy if exists day_plan_items_access on public.day_plan_items;
create policy day_plan_items_access on public.day_plan_items
  for all to authenticated
  using (
    exists (
      select 1 from public.day_plans p
      where p.id = day_plan_id
        and (
          (p.scope_type = 'user' and p.scope_id = (select auth.uid()))
          or (p.scope_type = 'household' and private.is_household_member(p.scope_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.day_plans p
      where p.id = day_plan_id
        and (
          (p.scope_type = 'user' and p.scope_id = (select auth.uid()))
          or (p.scope_type = 'household' and private.is_household_member(p.scope_id))
        )
    )
  );

revoke all on table public.day_plans, public.day_plan_items from anon, authenticated;
grant select, insert, update, delete on table public.day_plans, public.day_plan_items to authenticated;

-- ---------------------------------------------------------------------------
-- Calendar — encrypted tokens, cache is constraints only
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null default 'google',
  token_ciphertext text not null,
  token_iv text not null,
  token_tag text not null,
  scopes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_events_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  provider_event_id text not null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  calendar_ref text,
  synced_at timestamptz not null default now(),
  unique (user_id, provider, provider_event_id)
);

alter table public.calendar_connections enable row level security;
alter table public.calendar_events_cache enable row level security;

drop policy if exists calendar_connections_own on public.calendar_connections;
create policy calendar_connections_own on public.calendar_connections
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists calendar_events_own on public.calendar_events_cache;
create policy calendar_events_own on public.calendar_events_cache
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.calendar_connections, public.calendar_events_cache
  from anon, authenticated;
grant select, insert, update, delete on table public.calendar_connections to authenticated;
grant select, insert, update, delete on table public.calendar_events_cache to authenticated;

-- ---------------------------------------------------------------------------
-- Durable background jobs
-- ---------------------------------------------------------------------------
create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null check (job_type in ('bank_intake', 'brain_dump', 'transcription')),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'complete', 'failed')),
  idempotency_key text not null,
  recording_id uuid references public.recordings(id) on delete set null,
  error_code text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.background_jobs enable row level security;
drop policy if exists background_jobs_own on public.background_jobs;
create policy background_jobs_own on public.background_jobs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.background_jobs from anon, authenticated;
grant select, insert, update on table public.background_jobs to authenticated;

-- ---------------------------------------------------------------------------
-- First-party telemetry (no user content)
-- ---------------------------------------------------------------------------
create table if not exists public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  screen text,
  action text,
  result text,
  latency_ms int,
  http_status int,
  error_code text,
  app_version text,
  platform text,
  created_at timestamptz not null default now()
);

alter table public.telemetry_events enable row level security;
drop policy if exists telemetry_insert_own on public.telemetry_events;
create policy telemetry_insert_own on public.telemetry_events
  for insert to authenticated
  with check (user_id is null or user_id = (select auth.uid()));

drop policy if exists telemetry_no_select on public.telemetry_events;
create policy telemetry_no_select on public.telemetry_events
  for select to authenticated
  using (false);

revoke all on table public.telemetry_events from anon, authenticated;
grant insert on table public.telemetry_events to authenticated;

-- Developer communications opt-in (off by default)
alter table public.notification_preferences
  add column if not exists developer_comms_enabled boolean not null default false;
