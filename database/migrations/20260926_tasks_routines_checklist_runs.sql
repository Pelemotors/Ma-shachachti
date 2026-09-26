-- Task metadata, routines, and checklist runs.
-- Idempotent. Task↔Routine is routines.task_id (one active routine per task).
-- There is no tasks.routine_id column.
alter table public.tasks
  add column if not exists estimate_minutes integer,
  add column if not exists checklist_id uuid references public.checklists(id) on delete set null;

alter table public.checklists
  add column if not exists archived_at timestamptz;


create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  weekdays smallint[] not null default '{}',
  interval_days integer,
  time_of_day time,
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  timezone text not null default 'Asia/Jerusalem',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routines_valid_dates check (ends_on is null or ends_on >= starts_on),
  constraint routines_weekdays_valid check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);

create unique index if not exists routines_one_active_per_task
  on public.routines(task_id) where active;

alter table public.day_plan_items
  add column if not exists routine_id uuid references public.routines(id) on delete set null,
  add column if not exists occurrence_key text;
create unique index if not exists day_plan_routine_occurrence_unique
  on public.day_plan_items(day_plan_id, occurrence_key) where occurrence_key is not null;

create table if not exists public.routine_occurrence_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade,
  occurrence_date date not null,
  kind text not null check (kind in ('skip','override','done')),
  time_of_day time,
  created_at timestamptz not null default now(),
  unique (routine_id, occurrence_date)
);

create table if not exists public.checklist_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  occurrence_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checklist_id, occurrence_key)
);

create table if not exists public.checklist_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.checklist_runs(id) on delete cascade,
  template_item_id uuid not null references public.checklist_items(id) on delete cascade,
  checked boolean not null default false,
  unique (run_id, template_item_id)
);

alter table public.routine_occurrence_exceptions
  drop constraint if exists routine_occurrence_exceptions_kind_check;
alter table public.routine_occurrence_exceptions
  add constraint routine_occurrence_exceptions_kind_check
  check (kind in ('skip', 'override', 'done'));

create index if not exists routines_user_active_idx
  on public.routines (user_id, active);

alter table public.routines enable row level security;
alter table public.routine_occurrence_exceptions enable row level security;
alter table public.checklist_runs enable row level security;
alter table public.checklist_run_items enable row level security;

drop policy if exists routines_owner on public.routines;
create policy routines_owner on public.routines for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists routine_exceptions_owner on public.routine_occurrence_exceptions;
create policy routine_exceptions_owner on public.routine_occurrence_exceptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists checklist_runs_owner on public.checklist_runs;
create policy checklist_runs_owner on public.checklist_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists checklist_run_items_owner on public.checklist_run_items;
create policy checklist_run_items_owner on public.checklist_run_items for all using (
  exists (select 1 from public.checklist_runs r where r.id = run_id and r.user_id = auth.uid())
) with check (
  exists (select 1 from public.checklist_runs r where r.id = run_id and r.user_id = auth.uid())
);

grant select, insert, update, delete on public.routines, public.routine_occurrence_exceptions, public.checklist_runs, public.checklist_run_items to authenticated;

create or replace function public.create_checklist_with_items(p_title text, p_items text[] default '{}')
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_order integer;
begin
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'checklist_title_required';
  end if;
  select coalesce(max(order_index), -1) + 1 into v_order
  from public.checklists
  where user_id = auth.uid();
  insert into public.checklists (user_id, title, order_index)
  values (auth.uid(), btrim(p_title), v_order)
  returning id into v_id;
  if p_items is not null then
    insert into public.checklist_items (user_id, checklist_id, text, order_index)
    select auth.uid(), v_id, btrim(item), ord - 1
    from unnest(p_items) with ordinality as t(item, ord)
    where length(btrim(item)) > 0;
  end if;
  return v_id;
end;
$$;

revoke all on function public.create_checklist_with_items(text, text[]) from public;
grant execute on function public.create_checklist_with_items(text, text[]) to authenticated;
