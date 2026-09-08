-- EXPAND: atomic proposal approval = save app_state + mark proposal in one transaction.
-- Apply logic stays in the app; this RPC only persists the already-computed next state
-- together with the proposal status update so a mid-flight failure cannot leave
-- state saved while the proposal remains pending.

begin;

create or replace function public.approve_pending_proposal_save(
  p_proposal_id uuid,
  p_owner_id uuid,
  p_new_status text,
  p_payload jsonb,
  p_data jsonb,
  p_expected_revision bigint,
  p_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_status text;
  v_response jsonb;
  v_hash text;
  v_revision bigint;
begin
  if v_owner is null or v_owner is distinct from p_owner_id then
    raise exception 'unauthorized';
  end if;
  if p_new_status not in ('accepted', 'partial') then
    raise exception 'invalid_proposal_status';
  end if;
  if p_request_hash is null or length(p_request_hash) < 16 then
    raise exception 'invalid_request_hash';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_owner::text || ':proposal:' || p_proposal_id::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(v_owner::text || ':' || p_key::text, 0)
  );

  select status into v_status
    from public.pending_proposals
    where id = p_proposal_id and owner_id = v_owner
    for update;
  if v_status is null then
    raise exception 'proposal_not_found';
  end if;
  if v_status is distinct from 'pending' then
    -- Idempotent: if already finalized, return existing action receipt when present.
    select response, request_hash into v_response, v_hash
      from public.action_receipts
      where owner_id = v_owner and idempotency_key = p_key;
    if v_response is not null then
      if v_hash is not null and v_hash is distinct from p_request_hash then
        raise exception 'idempotency_conflict';
      end if;
      return v_response || jsonb_build_object('alreadyApplied', true, 'proposalStatus', v_status);
    end if;
    raise exception 'proposal_not_pending';
  end if;

  select response, request_hash into v_response, v_hash
    from public.action_receipts
    where owner_id = v_owner and idempotency_key = p_key;
  if v_response is not null then
    if v_hash is not null and v_hash is distinct from p_request_hash then
      raise exception 'idempotency_conflict';
    end if;
    update public.pending_proposals
      set status = p_new_status, payload = coalesce(p_payload, payload)
      where id = p_proposal_id and owner_id = v_owner and status = 'pending';
    return v_response || jsonb_build_object('alreadyApplied', true, 'proposalStatus', p_new_status);
  end if;

  v_revision := public.save_app_state(p_data, p_expected_revision);
  v_response := jsonb_build_object('state', p_data, 'revision', v_revision);

  insert into public.action_receipts(owner_id, idempotency_key, request_hash, response)
  values (v_owner, p_key, p_request_hash, v_response);

  update public.pending_proposals
    set status = p_new_status, payload = coalesce(p_payload, payload)
    where id = p_proposal_id and owner_id = v_owner and status = 'pending';

  delete from public.action_receipts
    where owner_id = v_owner and created_at < now() - interval '7 days';

  return v_response || jsonb_build_object('alreadyApplied', false, 'proposalStatus', p_new_status);
end;
$$;

revoke all on function public.approve_pending_proposal_save(
  uuid, uuid, text, jsonb, jsonb, bigint, uuid, text
) from public, anon;
grant execute on function public.approve_pending_proposal_save(
  uuid, uuid, text, jsonb, jsonb, bigint, uuid, text
) to authenticated, service_role;

commit;
