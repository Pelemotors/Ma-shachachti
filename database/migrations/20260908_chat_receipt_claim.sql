-- EXPAND: atomic chat turn claim + pending status on chat_receipts.
-- Safe: additive columns/defaults; existing rows become status=completed.

begin;

alter table public.chat_receipts
  add column if not exists status text not null default 'completed';

alter table public.chat_receipts
  drop constraint if exists chat_receipts_status_check;

alter table public.chat_receipts
  add constraint chat_receipts_status_check
  check (status in ('pending', 'completed', 'failed'));

-- Pending rows may store a placeholder response until the turn finishes.
alter table public.chat_receipts
  alter column response set default '{}'::jsonb;

grant select, insert, update, delete on public.chat_receipts to authenticated;
grant all on public.chat_receipts to service_role;

create or replace function public.claim_chat_receipt(
  p_owner uuid,
  p_key uuid,
  p_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.chat_receipts%rowtype;
  inserted public.chat_receipts%rowtype;
begin
  if auth.uid() is distinct from p_owner and auth.role() is distinct from 'service_role' then
    raise exception 'not_authorized';
  end if;

  select * into existing
  from public.chat_receipts
  where owner_id = p_owner and idempotency_key = p_key
  for update;

  if found then
    if existing.request_hash is distinct from p_hash then
      return jsonb_build_object('outcome', 'conflict');
    end if;
    if existing.status = 'completed' then
      return jsonb_build_object(
        'outcome', 'replay',
        'response', existing.response
      );
    end if;
    if existing.status = 'pending' then
      return jsonb_build_object('outcome', 'in_progress');
    end if;
    -- failed: allow retry by reclaiming
    update public.chat_receipts
      set status = 'pending',
          request_hash = p_hash,
          response = '{}'::jsonb
      where owner_id = p_owner and idempotency_key = p_key;
    return jsonb_build_object('outcome', 'claimed');
  end if;

  insert into public.chat_receipts(owner_id, idempotency_key, request_hash, response, status)
  values (p_owner, p_key, p_hash, '{}'::jsonb, 'pending')
  returning * into inserted;

  return jsonb_build_object('outcome', 'claimed');
exception
  when unique_violation then
    -- concurrent insert won — re-read
    select * into existing
    from public.chat_receipts
    where owner_id = p_owner and idempotency_key = p_key;
    if existing.request_hash is distinct from p_hash then
      return jsonb_build_object('outcome', 'conflict');
    end if;
    if existing.status = 'completed' then
      return jsonb_build_object('outcome', 'replay', 'response', existing.response);
    end if;
    return jsonb_build_object('outcome', 'in_progress');
end;
$$;

create or replace function public.complete_chat_receipt(
  p_owner uuid,
  p_key uuid,
  p_hash text,
  p_response jsonb,
  p_status text default 'completed'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.chat_receipts%rowtype;
begin
  if auth.uid() is distinct from p_owner and auth.role() is distinct from 'service_role' then
    raise exception 'not_authorized';
  end if;
  if p_status not in ('completed', 'failed') then
    raise exception 'invalid_status';
  end if;

  update public.chat_receipts
    set response = p_response,
        status = p_status,
        request_hash = p_hash
  where owner_id = p_owner
    and idempotency_key = p_key
    and request_hash = p_hash
  returning * into updated;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'receipt_missing');
  end if;
  return jsonb_build_object('ok', true, 'status', updated.status);
end;
$$;

revoke all on function public.claim_chat_receipt(uuid, uuid, text) from public;
revoke all on function public.complete_chat_receipt(uuid, uuid, text, jsonb, text) from public;
grant execute on function public.claim_chat_receipt(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.complete_chat_receipt(uuid, uuid, text, jsonb, text) to authenticated, service_role;

commit;
