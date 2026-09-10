drop policy if exists "chat_messages_select_own" on public.chat_messages;
drop policy if exists "chat_messages_insert_own" on public.chat_messages;

create policy "chat_messages_select_own"
  on public.chat_messages
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "chat_messages_insert_own"
  on public.chat_messages
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
