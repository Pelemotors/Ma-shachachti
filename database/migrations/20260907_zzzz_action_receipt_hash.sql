begin;

alter table public.action_receipts
  add column if not exists request_hash text;

create or replace function public.idempotent_save_app_state(
  p_data jsonb,
  p_expected_revision bigint,
  p_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_owner uuid:=auth.uid();
  v_response jsonb;
  v_hash text;
  v_revision bigint;
begin
  if v_owner is null then raise exception 'unauthorized'; end if;
  if p_request_hash is null or length(p_request_hash) < 16 then
    raise exception 'invalid_request_hash';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':'||p_key::text,0));
  select response,request_hash into v_response,v_hash
    from public.action_receipts
    where owner_id=v_owner and idempotency_key=p_key;

  if v_response is not null then
    if v_hash is not null and v_hash is distinct from p_request_hash then
      raise exception 'idempotency_conflict';
    end if;
    return v_response;
  end if;

  v_revision:=public.save_app_state(p_data,p_expected_revision);
  v_response:=jsonb_build_object('state',p_data,'revision',v_revision);
  insert into public.action_receipts(owner_id,idempotency_key,request_hash,response)
  values(v_owner,p_key,p_request_hash,v_response);
  delete from public.action_receipts
    where owner_id=v_owner and created_at<now()-interval '7 days';
  return v_response;
end;
$$;

revoke all on function public.idempotent_save_app_state(jsonb,bigint,uuid,text) from public,anon;
grant execute on function public.idempotent_save_app_state(jsonb,bigint,uuid,text) to authenticated;

commit;
