begin;
create table if not exists public.chat_receipts(
 owner_id uuid not null references auth.users(id) on delete cascade,
 idempotency_key uuid not null,
 request_hash text not null,
 response jsonb not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,idempotency_key)
);
alter table public.chat_receipts enable row level security;
drop policy if exists own_chat_receipts on public.chat_receipts;
create policy own_chat_receipts on public.chat_receipts for all to authenticated
 using(auth.uid()=owner_id and private.is_approved(auth.uid()))
 with check(auth.uid()=owner_id and private.is_approved(auth.uid()));
grant select,insert,delete on public.chat_receipts to authenticated;
grant all on public.chat_receipts to service_role;
commit;
