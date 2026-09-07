-- Allow AppState schemaVersion 2 (taxonomy / DailyPlan / members) while keeping V1 writes valid during rollout.
-- Preserves W reminder-queue sync (including cancel-stale-pending) from save_app_state.
-- pending_proposals table DDL lives in 20260908_pending_proposals_table.sql (domain 1).

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
