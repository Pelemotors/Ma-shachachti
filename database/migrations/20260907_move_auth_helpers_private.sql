begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles r where r.user_id=uid and r.role='admin' and r.approved=true);
$$;
create or replace function private.is_approved(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles r where r.user_id=uid and r.approved=true);
$$;
revoke all on function private.is_admin(uuid),private.is_approved(uuid) from public,anon;
grant execute on function private.is_admin(uuid),private.is_approved(uuid) to authenticated,service_role;

drop policy if exists own_state on public.app_states;
create policy own_state on public.app_states for all to authenticated
using(auth.uid()=owner_id and private.is_approved(auth.uid()))
with check(auth.uid()=owner_id and private.is_approved(auth.uid()));

drop policy if exists own_push on public.push_subscriptions;
create policy own_push on public.push_subscriptions for all to authenticated
using(auth.uid()=owner_id and private.is_approved(auth.uid()))
with check(auth.uid()=owner_id and private.is_approved(auth.uid()));

drop policy if exists own_reminders on public.reminder_queue;
create policy own_reminders on public.reminder_queue for all to authenticated
using(auth.uid()=owner_id and private.is_approved(auth.uid()))
with check(auth.uid()=owner_id and private.is_approved(auth.uid()));

drop policy if exists own_action_receipts on public.action_receipts;
create policy own_action_receipts on public.action_receipts for all to authenticated
using(auth.uid()=owner_id and private.is_approved(auth.uid()))
with check(auth.uid()=owner_id and private.is_approved(auth.uid()));

drop policy if exists admins_read_roles on public.user_roles;
create policy admins_read_roles on public.user_roles for select to authenticated using(private.is_admin(auth.uid()));
drop policy if exists admins_update_roles on public.user_roles;
create policy admins_update_roles on public.user_roles for update to authenticated using(private.is_admin(auth.uid())) with check(private.is_admin(auth.uid()));

drop function if exists public.is_admin(uuid);
drop function if exists public.is_approved(uuid);
commit;
