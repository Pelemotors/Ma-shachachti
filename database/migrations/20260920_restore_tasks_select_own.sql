-- Restore private-task SELECT after play-release overlay dropped it.
-- Without this, INSERT…RETURNING fails RLS and users cannot see their own tasks.

drop policy if exists "tasks_select_own" on public.tasks;
drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own on public.tasks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
