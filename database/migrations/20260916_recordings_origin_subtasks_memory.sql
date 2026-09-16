-- Recording bank vs chat provenance + task subtasks + memory reconcile fields.
-- Backward compatible: existing recordings default to 'chat' (excluded from bank).
-- Brain-dump/bank rows must set origin='bank' at insert time.

alter table public.recordings
  add column if not exists origin text not null default 'chat';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recordings_origin_check'
  ) then
    alter table public.recordings
      add constraint recordings_origin_check
      check (origin in ('chat', 'bank', 'share', 'other'));
  end if;
end $$;

create index if not exists recordings_user_origin_created_idx
  on public.recordings (user_id, origin, created_at desc);

-- Heuristic backfill: rows already linked to brain-dump processing stay bank.
-- Without a reliable historical signal, prefer excluding old rows from the bank
-- (default 'chat') so chat mic history does not pollute the bank.

create table if not exists public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) >= 1 and char_length(title) <= 200),
  done boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_subtasks_task_order_idx
  on public.task_subtasks (task_id, order_index, created_at);

create index if not exists task_subtasks_user_idx
  on public.task_subtasks (user_id, task_id);

alter table public.task_subtasks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'task_subtasks' and policyname = 'task_subtasks_select_own'
  ) then
    create policy task_subtasks_select_own on public.task_subtasks
      for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'task_subtasks' and policyname = 'task_subtasks_insert_own'
  ) then
    create policy task_subtasks_insert_own on public.task_subtasks
      for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'task_subtasks' and policyname = 'task_subtasks_update_own'
  ) then
    create policy task_subtasks_update_own on public.task_subtasks
      for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'task_subtasks' and policyname = 'task_subtasks_delete_own'
  ) then
    create policy task_subtasks_delete_own on public.task_subtasks
      for delete to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end $$;

grant select, insert, update, delete on public.task_subtasks to authenticated;
grant all on public.task_subtasks to service_role;

-- Memory: active/scope/category for merge without blind replace of history.
alter table public.agent_memory
  add column if not exists active boolean not null default true;

alter table public.agent_memory
  add column if not exists scope text not null default 'always';

alter table public.agent_memory
  add column if not exists category text not null default 'note';

alter table public.agent_memory
  add column if not exists supersedes uuid references public.agent_memory (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agent_memory_scope_check'
  ) then
    alter table public.agent_memory
      add constraint agent_memory_scope_check
      check (scope in ('always', 'temporary'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'agent_memory_category_check'
  ) then
    alter table public.agent_memory
      add constraint agent_memory_category_check
      check (category in ('preference', 'habit', 'relation', 'exception', 'fact', 'note'));
  end if;
end $$;

create index if not exists agent_memory_user_active_updated_idx
  on public.agent_memory (user_id, active, updated_at desc);

-- Classify existing rows for display without rewriting content.
update public.agent_memory
set category = case
  when content like '%"kind":"action_followup"%' or content like '%"kind": "action_followup"%' then 'relation'
  when kind = 'preference' then 'preference'
  when kind = 'fact' then 'fact'
  else 'note'
end
where category = 'note'
  and (
    content like '%"kind":"action_followup"%'
    or content like '%"kind": "action_followup"%'
    or kind in ('preference', 'fact')
  );

-- Allow insights presentation persistence (required for deep-check).
alter table public.chat_messages drop constraint if exists chat_messages_presentation_check;
alter table public.chat_messages
  add constraint chat_messages_presentation_check
  check (
    presentation is null
    or (
      jsonb_typeof(presentation) = 'object'
      and (presentation->>'type') = any (
        array['task_list', 'schedule_plan', 'task_suggestions', 'insights']
      )
    )
  );
