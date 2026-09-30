-- M14: household facts used as agent context only.
-- This is additive and does not create Tasks, Reminders, Routines, or plans.
alter table public.user_profiles
  add column if not exists household_context jsonb not null default '{}'::jsonb;

alter table public.user_profiles
  drop constraint if exists user_profiles_household_context_object;

alter table public.user_profiles
  add constraint user_profiles_household_context_object
  check (jsonb_typeof(household_context) = 'object');
