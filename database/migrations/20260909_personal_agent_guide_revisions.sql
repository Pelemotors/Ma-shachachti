-- Personal Agent Guide revision audit (durable).
-- Current guide document lives in app_states.data.personalAgentGuide (EXTEND).
-- This table stores successful approved revisions for audit/rollback.
-- Safe: create-only; does not alter save_app_state.

create table if not exists public.personal_agent_guide_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  previous_revision bigint not null check (previous_revision >= 0),
  text text not null check (char_length(text) between 1 and 50000),
  source_turn_id uuid,
  proposal_id uuid,
  created_at timestamptz not null default now(),
  unique (owner_id, revision)
);

create index if not exists personal_agent_guide_revisions_owner_idx
  on public.personal_agent_guide_revisions(owner_id, revision desc);

alter table public.personal_agent_guide_revisions enable row level security;

drop policy if exists personal_agent_guide_revisions_owner_all
  on public.personal_agent_guide_revisions;
create policy personal_agent_guide_revisions_owner_all
  on public.personal_agent_guide_revisions
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

grant select, insert on public.personal_agent_guide_revisions to authenticated;
grant all on public.personal_agent_guide_revisions to service_role;
