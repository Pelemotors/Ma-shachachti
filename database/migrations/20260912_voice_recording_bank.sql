-- Phase 7: private, owner-scoped recording bank. There are no legacy rows to
-- backfill, so this migration is intentionally a safe no-op for existing data.
create table if not exists public.recordings (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('uploading', 'processing', 'ready', 'error')),
  storage_path text,
  mime text not null check (mime in ('audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav')),
  size bigint not null check (size > 0 and size <= 10000000),
  duration_seconds numeric(8, 3) not null check (duration_seconds >= 0 and duration_seconds <= 90),
  transcript text check (transcript is null or char_length(transcript) <= 6000),
  error_code text check (error_code is null or char_length(error_code) <= 64),
  error_message text check (error_message is null or char_length(error_message) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  delete_after timestamptz,
  audio_deleted_at timestamptz,
  processing_token uuid,
  unique (user_id, id),
  unique (storage_path),
  check (storage_path is null or storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webm|mp4|ogg|wav)$'),
  check (status <> 'ready' or (transcript is not null and processed_at is not null)),
  check (status = 'ready' or delete_after is null),
  check (
    storage_path is not null
    or status in ('uploading', 'error')
    or audio_deleted_at is not null
  ),
  check (
    (status in ('uploading', 'processing') and processing_token is not null)
    or (status in ('ready', 'error') and processing_token is null)
  )
);

create index if not exists recordings_user_created_idx
  on public.recordings(user_id, created_at desc);
create index if not exists recordings_retention_idx
  on public.recordings(delete_after)
  where status = 'ready' and storage_path is not null;
create index if not exists recordings_stale_claim_idx
  on public.recordings(status, updated_at)
  where status in ('uploading', 'processing');

alter table public.recordings enable row level security;

drop policy if exists recordings_select_own on public.recordings;
create policy recordings_select_own on public.recordings
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists recordings_insert_own on public.recordings;
create policy recordings_insert_own on public.recordings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists recordings_update_own on public.recordings;
create policy recordings_update_own on public.recordings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists recordings_delete_own on public.recordings;
create policy recordings_delete_own on public.recordings
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.recordings from anon;
grant select, insert, update, delete on public.recordings to authenticated;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'recordings',
  'recordings',
  false,
  10000000,
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
