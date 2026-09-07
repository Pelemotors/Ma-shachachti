-- Allow AppState schemaVersion 2 (taxonomy / DailyPlan / members) while keeping V1 writes valid during rollout.
-- Preserves W reminder-queue sync (including cancel-stale-pending) from save_app_state.

create or replace function public.save_app_state(p_data jsonb, p_expected_revision bigint)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_revision bigint;
  v_owner uuid := auth.uid();
  v_version text := p_data->>'schemaVersion';
begin
  if v_owner is null then raise exception 'unauthorized'; end if;
  if v_version not in ('1', '2') or jsonb_typeof(p_data->'reminders') <> 'array' then
    raise exception 'invalid_state';
  end if;
  if p_expected_revision = 0 then
    insert into app_states(owner_id, data, revision)
    values (v_owner, p_data, 1)
    on conflict do nothing
    returning revision into v_revision;
  else
    update app_states
    set data = p_data, revision = revision + 1, updated_at = now()
    where owner_id = v_owner and revision = p_expected_revision
    returning revision into v_revision;
  end if;
  if v_revision is null then raise exception 'revision_conflict'; end if;
  insert into reminder_queue(id, owner_id, due_at, status)
    select
      (r->>'id')::uuid,
      v_owner,
      (r->>'dueAt')::timestamptz,
      case when r->>'status' = 'cancelled' then 'cancelled' else 'pending' end
    from jsonb_array_elements(p_data->'reminders') r
    on conflict (id) do update set
      due_at = excluded.due_at,
      status = case
        when excluded.status = 'cancelled' then 'cancelled'
        when reminder_queue.status in ('sent', 'failed') then reminder_queue.status
        else excluded.status
      end
    where reminder_queue.owner_id = v_owner;
  update reminder_queue
    set status = 'cancelled'
    where owner_id = v_owner
      and status = 'pending'
      and id not in (
        select (r->>'id')::uuid from jsonb_array_elements(p_data->'reminders') r
      );
  return v_revision;
end;
$$;

revoke all on function public.save_app_state(jsonb, bigint) from public, anon;
grant execute on function public.save_app_state(jsonb, bigint) to authenticated;

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
