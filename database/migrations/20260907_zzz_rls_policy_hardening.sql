begin;

drop policy if exists users_read_own_role on public.user_roles;
drop policy if exists admins_read_roles on public.user_roles;
create policy user_roles_read on public.user_roles for select to authenticated
using ((select auth.uid()) = user_id or private.is_admin((select auth.uid())));

drop policy if exists admins_update_roles on public.user_roles;
create policy admins_update_roles on public.user_roles for update to authenticated
using (private.is_admin((select auth.uid())))
with check (private.is_admin((select auth.uid())));

drop policy if exists owners_read_activity on public.activity_events;
create policy owners_read_activity on public.activity_events for select to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists own_state on public.app_states;
create policy own_state on public.app_states for all to authenticated
using ((select auth.uid()) = owner_id and private.is_approved((select auth.uid())))
with check ((select auth.uid()) = owner_id and private.is_approved((select auth.uid())));

drop policy if exists own_push on public.push_subscriptions;
create policy own_push on public.push_subscriptions for all to authenticated
using ((select auth.uid()) = owner_id and private.is_approved((select auth.uid())))
with check ((select auth.uid()) = owner_id and private.is_approved((select auth.uid())));

drop policy if exists own_reminders on public.reminder_queue;
create policy own_reminders on public.reminder_queue for all to authenticated
using ((select auth.uid()) = owner_id and private.is_approved((select auth.uid())))
with check ((select auth.uid()) = owner_id and private.is_approved((select auth.uid())));

drop policy if exists own_action_receipts on public.action_receipts;
create policy own_action_receipts on public.action_receipts for all to authenticated
using ((select auth.uid()) = owner_id and private.is_approved((select auth.uid())))
with check ((select auth.uid()) = owner_id and private.is_approved((select auth.uid())));

drop policy if exists own_chat_receipts on public.chat_receipts;
create policy own_chat_receipts on public.chat_receipts for all to authenticated
using ((select auth.uid()) = owner_id and private.is_approved((select auth.uid())))
with check ((select auth.uid()) = owner_id and private.is_approved((select auth.uid())));

drop policy if exists deny_authenticated_ai_budgets on public.ai_budgets;
create policy deny_authenticated_ai_budgets on public.ai_budgets for all to authenticated
using (false) with check (false);

commit;
