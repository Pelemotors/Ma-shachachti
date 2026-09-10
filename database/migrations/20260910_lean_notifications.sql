create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_reminder_minutes integer not null default 30
    check (default_reminder_minutes in (10, 30, 60, 180, 1440)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "notification_preferences_select_own"
  on public.notification_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "notification_preferences_insert_own"
  on public.notification_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "notification_preferences_update_own"
  on public.notification_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.notification_preferences to authenticated;

create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) < 2000),
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_push_subscriptions_user_idx
  on public.user_push_subscriptions (user_id);

alter table public.user_push_subscriptions enable row level security;

create policy "user_push_subscriptions_select_own"
  on public.user_push_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_push_subscriptions_insert_own"
  on public.user_push_subscriptions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_push_subscriptions_update_own"
  on public.user_push_subscriptions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "user_push_subscriptions_delete_own"
  on public.user_push_subscriptions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_push_subscriptions to authenticated;

create index if not exists tasks_open_reminders_idx
  on public.tasks (due_at)
  where status = 'open'
    and reminder_enabled
    and reminder_sent_at is null
    and due_at is not null;
