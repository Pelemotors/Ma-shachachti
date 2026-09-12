-- Local-only Phase 1A security proof. Do not apply to the linked Production project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'smith_test') then
    create role smith_test
      nologin
      noinherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication;
  end if;
end
$$;

grant smith_test to authenticator;
revoke smith_test from anon, authenticated, service_role;

create schema if not exists smith_test;
revoke all on schema smith_test from public, anon, authenticated, service_role;
grant usage on schema smith_test to smith_test;

create table smith_test.probe (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  value text not null,
  created_at timestamptz not null default now()
);

alter table smith_test.probe enable row level security;
alter table smith_test.probe force row level security;

create policy "smith_test owns probe rows"
on smith_test.probe
for all
to smith_test
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on smith_test.probe to smith_test;

-- A local representative of Production user data. It intentionally remains
-- available only to the normal authenticated role.
revoke usage on schema public from public;
grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;

create table public.smith_poc_production_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  value text not null
);

alter table public.smith_poc_production_records enable row level security;
alter table public.smith_poc_production_records force row level security;

create policy "authenticated owns production-style rows"
on public.smith_poc_production_records
for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

revoke all on public.smith_poc_production_records
from public, anon, smith_test;
grant select, insert, update, delete
on public.smith_poc_production_records
to authenticated;

create or replace function public.smith_poc_production_rpc()
returns text
language sql
stable
set search_path = ''
as $$
  select 'production-only'::text;
$$;

revoke execute on function public.smith_poc_production_rpc()
from public, anon, smith_test;
grant execute on function public.smith_poc_production_rpc()
to authenticated;

-- Local Auth calls this function before every access-token issue. Authorization
-- is based only on server-managed app_metadata included by Auth.
create or replace function public.smith_test_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
begin
  claims := event -> 'claims';

  if claims #>> '{app_metadata,environment}' = 'smith_test' then
    claims := jsonb_set(claims, '{role}', to_jsonb('smith_test'::text));
  end if;

  return jsonb_build_object('claims', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.smith_test_access_token_hook(jsonb)
to supabase_auth_admin;
revoke execute on function public.smith_test_access_token_hook(jsonb)
from public, anon, authenticated, smith_test;

insert into storage.buckets (id, name, public)
values ('production-recordings', 'production-recordings', false)
on conflict (id) do update set public = false;

create policy "authenticated owns production-style recordings"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'production-recordings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'production-recordings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
