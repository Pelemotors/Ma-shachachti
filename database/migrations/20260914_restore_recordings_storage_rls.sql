-- Restore recordings storage RLS policies after self-host migration.
-- Without these, authenticated uploads to the recordings bucket fail with
-- "new row violates row-level security policy" while service_role still works.

drop policy if exists recordings_storage_select_own on storage.objects;
create policy recordings_storage_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists recordings_storage_insert_own on storage.objects;
create policy recordings_storage_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists recordings_storage_delete_own on storage.objects;
create policy recordings_storage_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
