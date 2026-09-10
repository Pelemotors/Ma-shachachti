alter table public.tasks
  add column if not exists due_at timestamptz,
  add column if not exists reminder_offset_minutes integer,
  add column if not exists reminder_enabled boolean not null default true,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists reminder_claimed_at timestamptz;

alter table public.tasks
  drop constraint if exists tasks_reminder_offset_minutes_check;

alter table public.tasks
  add constraint tasks_reminder_offset_minutes_check
  check (
    reminder_offset_minutes is null
    or (
      reminder_offset_minutes >= 0
      and reminder_offset_minutes <= 10080
    )
  );

create index if not exists tasks_open_due_at_idx
  on public.tasks (status, due_at)
  where status = 'open' and due_at is not null;
