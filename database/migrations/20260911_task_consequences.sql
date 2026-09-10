create table if not exists public.task_consequences (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  severity text not null check (severity in ('none', 'low', 'medium', 'high', 'critical')),
  reason text not null check (char_length(reason) between 1 and 280),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  basis jsonb not null check (
    jsonb_typeof(basis) = 'object'
    and basis ? 'kind'
    and basis->>'kind' in ('explicit', 'mixed', 'inferred')
    and basis - 'kind' = '{}'::jsonb
  ),
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_consequences_user_idx
  on public.task_consequences (user_id);

alter table public.task_consequences enable row level security;

create policy "task_consequences_select_own"
  on public.task_consequences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "task_consequences_insert_own"
  on public.task_consequences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "task_consequences_update_own"
  on public.task_consequences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.task_consequences to authenticated;
