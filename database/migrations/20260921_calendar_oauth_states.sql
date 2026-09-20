-- Server-only one-time OAuth states for Google Calendar connect.
-- Tokens remain in calendar_connections ciphertext; clients never read this table.

create table if not exists public.calendar_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists calendar_oauth_states_expires_idx
  on public.calendar_oauth_states (expires_at);

alter table public.calendar_oauth_states enable row level security;

revoke all on table public.calendar_oauth_states from anon, authenticated;

-- Calendar connection ciphertext is server-owned. Authenticated clients
-- must not read token columns via PostgREST.
revoke all on table public.calendar_connections from anon, authenticated;

-- Event cache stays readable by the owning user for planning UI.
revoke all on table public.calendar_events_cache from anon;
grant select on table public.calendar_events_cache to authenticated;
