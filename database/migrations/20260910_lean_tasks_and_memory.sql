create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_user_status_due_idx
  on public.tasks (user_id, status, due_on);

alter table public.tasks enable row level security;

create policy "tasks_select_own"
  on public.tasks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "tasks_insert_own"
  on public.tasks
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "tasks_update_own"
  on public.tasks
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "tasks_delete_own"
  on public.tasks
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.tasks to authenticated;

create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('preference', 'fact')),
  content text not null check (char_length(content) between 1 and 500),
  confidence text not null default 'medium' check (confidence in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_memory_user_updated_idx
  on public.agent_memory (user_id, updated_at desc);

alter table public.agent_memory enable row level security;

create policy "agent_memory_select_own"
  on public.agent_memory
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "agent_memory_insert_own"
  on public.agent_memory
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "agent_memory_update_own"
  on public.agent_memory
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "agent_memory_delete_own"
  on public.agent_memory
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.agent_memory to authenticated;
