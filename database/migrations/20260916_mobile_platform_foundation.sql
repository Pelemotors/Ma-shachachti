-- Mobile Platform Foundation: identities, installations, notifications, flags.
-- Backward compatible: existing auth.users remain the internal User.
-- Production must NOT apply this file in this task.

create table if not exists public.user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('apple', 'google', 'email')),
  provider_subject text not null,
  email_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create index if not exists user_identities_user_idx
  on public.user_identities (user_id);

alter table public.user_identities enable row level security;

drop policy if exists "user_identities_select_own" on public.user_identities;
create policy "user_identities_select_own"
  on public.user_identities
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.user_identities from anon, authenticated;
grant select on public.user_identities to authenticated;

insert into public.user_identities (user_id, provider, provider_subject)
select id, 'email', id::text
from auth.users
on conflict (provider, provider_subject) do nothing;

create table if not exists public.user_installations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('web', 'ios', 'android')),
  app_version text,
  build_number text,
  push_token text,
  push_provider text check (push_provider in ('web_push', 'apns', 'fcm')),
  push_permission text check (
    push_permission in ('UNKNOWN', 'GRANTED', 'DENIED', 'RESTRICTED')
    or push_permission is null
  ),
  timezone text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_installations_user_idx
  on public.user_installations (user_id)
  where revoked_at is null;

create unique index if not exists user_installations_push_token_uq
  on public.user_installations (push_provider, push_token)
  where push_token is not null and revoked_at is null;

alter table public.user_installations enable row level security;

drop policy if exists "user_installations_select_own" on public.user_installations;
create policy "user_installations_select_own"
  on public.user_installations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_installations_insert_own" on public.user_installations;
create policy "user_installations_insert_own"
  on public.user_installations for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_installations_update_own" on public.user_installations;
create policy "user_installations_update_own"
  on public.user_installations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.user_installations from anon, authenticated;
grant select, insert, update on public.user_installations to authenticated;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'TASK_DUE',
    'TASK_OVERDUE',
    'REMINDER',
    'ROUTINE_DUE',
    'SCHEDULE_ATTENTION',
    'SHOPPING_ATTENTION',
    'AGENT_ATTENTION'
  )),
  logical_key text not null,
  title text not null,
  body text,
  route text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  delivered_web_at timestamptz,
  delivered_apns_at timestamptz,
  delivered_fcm_at timestamptz,
  opened_at timestamptz,
  unique (user_id, logical_key)
);

create index if not exists app_notifications_user_idx
  on public.app_notifications (user_id, created_at desc);

alter table public.app_notifications enable row level security;

drop policy if exists "app_notifications_select_own" on public.app_notifications;
create policy "app_notifications_select_own"
  on public.app_notifications for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "app_notifications_update_own" on public.app_notifications;
create policy "app_notifications_update_own"
  on public.app_notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.app_notifications from anon, authenticated;
grant select, update on public.app_notifications to authenticated;

alter table public.notification_preferences
  add column if not exists kinds jsonb not null default '{}'::jsonb;

create table if not exists public.app_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.app_feature_flags (key, enabled) values
  ('NATIVE_PUSH_ENABLED', false),
  ('SHARE_CAPTURE_ENABLED', true),
  ('MOBILE_VOICE_ENABLED', true),
  ('MONETIZATION_ENABLED', false)
on conflict (key) do nothing;

alter table public.app_feature_flags enable row level security;

drop policy if exists "app_feature_flags_select" on public.app_feature_flags;
create policy "app_feature_flags_select"
  on public.app_feature_flags for select to authenticated
  using (true);

revoke all on public.app_feature_flags from anon, authenticated;
grant select on public.app_feature_flags to authenticated;

create table if not exists public.account_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.account_audit enable row level security;
revoke all on public.account_audit from anon, authenticated;
