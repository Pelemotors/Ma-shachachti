create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists chat_sessions_user_created_idx
  on public.chat_sessions (user_id, created_at desc);

alter table public.chat_sessions enable row level security;

create policy "chat_sessions_select_own"
  on public.chat_sessions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "chat_sessions_insert_own"
  on public.chat_sessions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.chat_sessions to authenticated;

insert into public.chat_sessions (user_id)
select distinct user_id
from public.chat_messages
where user_id is not null
  and not exists (
    select 1 from public.chat_sessions s where s.user_id = chat_messages.user_id
  );

alter table public.chat_messages
  add column if not exists session_id uuid references public.chat_sessions(id);

update public.chat_messages as m
set session_id = s.id
from public.chat_sessions as s
where m.session_id is null
  and s.user_id = m.user_id;

do $$
begin
  if exists (select 1 from public.chat_messages where session_id is null) then
    raise exception 'chat_messages backfill left null session_id rows';
  end if;
end $$;

alter table public.chat_messages
  alter column session_id set not null;

create index if not exists chat_messages_session_created_idx
  on public.chat_messages (session_id, created_at);
