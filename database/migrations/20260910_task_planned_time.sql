alter table public.tasks
  add column if not exists planned_start_at timestamptz,
  add column if not exists planned_end_at timestamptz;
