-- Phase 5 audit decision:
-- auth.user_metadata has no Lean profile fields and the only legacy values live
-- in app_states.data.profile. user_profiles is therefore the canonical Lean source.
-- This migration only reads the legacy blob; it never updates or deletes it.
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (
    display_name is null or char_length(display_name) between 1 and 80
  ),
  address_style text not null default 'neutral'
    check (address_style in ('neutral', 'masculine', 'feminine')),
  onboarding_completed_at timestamptz,
  appearance_mode text not null default 'auto'
    check (appearance_mode in ('auto', 'season')),
  appearance_season text
    check (appearance_season in ('spring', 'summer', 'autumn', 'winter')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (appearance_mode = 'auto' and appearance_season is null)
    or (appearance_mode = 'season' and appearance_season is not null)
  )
);

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own"
  on public.user_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
  on public.user_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
  on public.user_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.user_profiles from anon;
grant select, insert, update on public.user_profiles to authenticated;

-- to_jsonb avoids coupling the migration to any other legacy app_states columns.
-- Invalid/missing JSON types become null/defaults. autoApply and all old engine
-- settings are intentionally absent.
do $migration$
begin
  if to_regclass('public.app_states') is not null then
    insert into public.user_profiles (
      user_id,
      display_name,
      address_style,
      onboarding_completed_at,
      appearance_mode,
      appearance_season
    )
    select
      auth_user.id,
      case
        when jsonb_typeof(legacy.profile -> 'name') = 'string'
          and char_length(btrim(legacy.profile ->> 'name')) between 1 and 80
        then btrim(legacy.profile ->> 'name')
        else null
      end,
      case legacy.profile ->> 'addressAs'
        when 'masculine' then 'masculine'
        when 'male' then 'masculine'
        when 'זכר' then 'masculine'
        when 'feminine' then 'feminine'
        when 'female' then 'feminine'
        when 'נקבה' then 'feminine'
        else 'neutral'
      end,
      case
        when jsonb_typeof(legacy.profile -> 'onboarded') = 'boolean'
          and (legacy.profile ->> 'onboarded')::boolean
        then now()
        else null
      end,
      case
        when jsonb_typeof(legacy.profile -> 'themeMode') = 'string'
          and legacy.profile ->> 'themeMode' = 'fixed'
          and jsonb_typeof(legacy.profile -> 'fixedTheme') = 'string'
          and legacy.profile ->> 'fixedTheme'
            in ('spring', 'summer', 'autumn', 'winter')
        then 'season'
        else 'auto'
      end,
      case
        when jsonb_typeof(legacy.profile -> 'themeMode') = 'string'
          and legacy.profile ->> 'themeMode' = 'fixed'
          and jsonb_typeof(legacy.profile -> 'fixedTheme') = 'string'
          and legacy.profile ->> 'fixedTheme'
            in ('spring', 'summer', 'autumn', 'winter')
        then legacy.profile ->> 'fixedTheme'
        else null
      end
    from (
      select
        to_jsonb(state_row) as row_json,
        case
          when jsonb_typeof(to_jsonb(state_row) -> 'data') = 'object'
            and jsonb_typeof(
              to_jsonb(state_row) -> 'data' -> 'profile'
            ) = 'object'
          then to_jsonb(state_row) -> 'data' -> 'profile'
          else '{}'::jsonb
        end as profile
      from public.app_states as state_row
    ) as legacy
    join auth.users as auth_user
      on legacy.row_json ->> 'owner_id' = auth_user.id::text
    on conflict (user_id) do nothing;
  end if;
end
$migration$;
