alter table public.tasks
  add column if not exists reschedule_count integer not null default 0,
  add column if not exists last_rescheduled_at timestamptz;
