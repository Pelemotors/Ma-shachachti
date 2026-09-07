-- Domain 1: pending_proposals table + approved-owner RLS.
-- Safe on existing projects: does not alter save_app_state / State V2 acceptance.
-- Applied on Production as migration pending_proposals_table (20260907215832).

create table if not exists public.pending_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  turn_id uuid,
  type text not null,
  payload jsonb not null,
  source_revision bigint not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'partial', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists pending_proposals_owner_idx
  on public.pending_proposals(owner_id, status, expires_at);

alter table public.pending_proposals enable row level security;

drop policy if exists pending_proposals_owner_all on public.pending_proposals;
create policy pending_proposals_owner_all on public.pending_proposals
  for all to authenticated
  using ((select auth.uid()) = owner_id and private.is_approved((select auth.uid())))
  with check ((select auth.uid()) = owner_id and private.is_approved((select auth.uid())));

grant select, insert, update, delete on public.pending_proposals to authenticated;
grant all on public.pending_proposals to service_role;
