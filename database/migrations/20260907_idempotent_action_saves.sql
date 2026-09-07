begin;
create table if not exists public.action_receipts(
 owner_id uuid not null references auth.users(id) on delete cascade,
 idempotency_key uuid not null,
 response jsonb not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,idempotency_key)
);
alter table public.action_receipts enable row level security;
drop policy if exists own_action_receipts on public.action_receipts;
create policy own_action_receipts on public.action_receipts for all to authenticated
 using(auth.uid()=owner_id and public.is_approved(auth.uid()))
 with check(auth.uid()=owner_id and public.is_approved(auth.uid()));
grant select,insert,delete on public.action_receipts to authenticated;
grant all on public.action_receipts to service_role;
create or replace function public.idempotent_save_app_state(p_data jsonb,p_expected_revision bigint,p_key uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_owner uuid:=auth.uid(); v_response jsonb; v_revision bigint;
begin
 if v_owner is null then raise exception 'unauthorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':'||p_key::text,0));
 select response into v_response from action_receipts where owner_id=v_owner and idempotency_key=p_key;
 if v_response is not null then return v_response; end if;
 v_revision:=public.save_app_state(p_data,p_expected_revision);
 v_response:=jsonb_build_object('state',p_data,'revision',v_revision);
 insert into action_receipts(owner_id,idempotency_key,response) values(v_owner,p_key,v_response);
 delete from action_receipts where owner_id=v_owner and created_at<now()-interval '7 days';
 return v_response;
end;$$;
revoke all on function public.idempotent_save_app_state(jsonb,bigint,uuid) from public,anon;
grant execute on function public.idempotent_save_app_state(jsonb,bigint,uuid) to authenticated;
commit;
