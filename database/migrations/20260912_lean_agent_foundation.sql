alter table public.agent_memory
  add column if not exists source text not null default 'legacy',
  add column if not exists seen_at timestamptz;

update public.agent_memory
set source = 'legacy'
where source is null or source not in ('user', 'agent', 'legacy');

alter table public.agent_memory
  drop constraint if exists agent_memory_source_check;
alter table public.agent_memory
  add constraint agent_memory_source_check
  check (source in ('user', 'agent', 'legacy'));

alter table public.chat_messages
  add column if not exists presentation jsonb;

create unique index if not exists chat_sessions_user_id_id_idx
  on public.chat_sessions (user_id, id);

alter table public.chat_messages
  drop constraint if exists chat_messages_presentation_check;
alter table public.chat_messages
  add constraint chat_messages_presentation_check
  check (
    presentation is null
    or (
      jsonb_typeof(presentation) = 'object'
      and presentation ->> 'type' in (
        'task_list',
        'schedule_plan',
        'task_suggestions'
      )
    )
  );

create table if not exists public.agent_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  turn_key uuid not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  response jsonb,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, turn_key),
  unique (user_id, id),
  foreign key (user_id, session_id)
    references public.chat_sessions(user_id, id) on delete cascade
);

create index if not exists agent_turns_user_created_idx
  on public.agent_turns (user_id, created_at desc);

alter table public.agent_turns enable row level security;

drop policy if exists "agent_turns_select_own" on public.agent_turns;
create policy "agent_turns_select_own"
  on public.agent_turns for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "agent_turns_insert_own" on public.agent_turns;
create policy "agent_turns_insert_own"
  on public.agent_turns for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "agent_turns_update_own" on public.agent_turns;
create policy "agent_turns_update_own"
  on public.agent_turns for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.agent_turns from anon;
grant select, insert, update on public.agent_turns to authenticated;

create table if not exists public.agent_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  turn_id uuid not null,
  summary text not null check (char_length(summary) between 1 and 500),
  actions jsonb not null check (
    jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) between 1 and 10
  ),
  status text not null default 'pending'
    check (status in ('pending', 'executing', 'approved', 'rejected', 'expired')),
  revision integer not null default 1 check (revision > 0),
  action_results jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, session_id)
    references public.chat_sessions(user_id, id) on delete cascade,
  foreign key (user_id, turn_id)
    references public.agent_turns(user_id, id) on delete cascade
);

create index if not exists agent_proposals_user_status_idx
  on public.agent_proposals (user_id, status, created_at desc);

alter table public.agent_proposals enable row level security;

drop policy if exists "agent_proposals_select_own" on public.agent_proposals;
create policy "agent_proposals_select_own"
  on public.agent_proposals for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "agent_proposals_insert_own" on public.agent_proposals;
create policy "agent_proposals_insert_own"
  on public.agent_proposals for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "agent_proposals_update_own" on public.agent_proposals;
create policy "agent_proposals_update_own"
  on public.agent_proposals for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.agent_proposals from anon;
grant select, insert, update on public.agent_proposals to authenticated;

alter table public.agent_turns
  add column if not exists decision jsonb;

alter table public.chat_messages
  add column if not exists turn_id uuid;

alter table public.chat_messages
  drop constraint if exists chat_messages_user_turn_fkey;
alter table public.chat_messages
  add constraint chat_messages_user_turn_fkey
  foreign key (user_id, turn_id)
  references public.agent_turns(user_id, id) on delete cascade;

create unique index if not exists chat_messages_user_turn_role_idx
  on public.chat_messages (user_id, turn_id, role)
  where turn_id is not null;

create unique index if not exists agent_proposals_user_turn_idx
  on public.agent_proposals (user_id, turn_id);

create table if not exists public.agent_action_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('turn', 'proposal')),
  scope_id uuid not null,
  action_index integer not null check (action_index >= 0 and action_index < 10),
  action jsonb not null check (jsonb_typeof(action) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, scope, scope_id, action_index)
);

alter table public.agent_action_executions enable row level security;

drop policy if exists "agent_action_executions_select_own"
  on public.agent_action_executions;
create policy "agent_action_executions_select_own"
  on public.agent_action_executions for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.agent_action_executions from anon;
revoke insert, update, delete on public.agent_action_executions
  from authenticated;
grant select on public.agent_action_executions to authenticated;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.execute_lean_action_idempotent_impl(
  p_scope text,
  p_scope_id uuid,
  p_action_index integer,
  p_action jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_type text := p_action ->> 'type';
  v_id uuid;
  v_title text;
  v_notes text;
  v_due_on date;
  v_due_time time;
  v_due_at timestamptz;
  v_planned_start timestamptz;
  v_planned_end timestamptz;
  v_reminder_enabled boolean;
  v_reminder_offset integer;
  v_current public.tasks%rowtype;
  v_existing_action jsonb;
  v_existing_result jsonb;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if p_scope not in ('turn', 'proposal')
    or p_action_index < 0
    or p_action_index >= 10
    or jsonb_typeof(p_action) <> 'object' then
    raise exception 'invalid action execution key';
  end if;
  if p_scope = 'turn' and not exists (
    select 1 from public.agent_turns
    where id = p_scope_id
      and user_id = v_user_id
      and (
        status = 'processing'
        or (
          status = 'completed'
          and exists (
            select 1 from public.agent_action_executions execution
            where execution.user_id = v_user_id
              and execution.scope = 'turn'
              and execution.scope_id = p_scope_id
              and execution.action_index = p_action_index
              and execution.action = p_action
          )
        )
      )
      and decision ->> 'kind' = 'decision'
      and decision -> 'value' -> 'actions' -> p_action_index = p_action
  ) then
    raise exception 'turn action is not authorized';
  end if;
  if p_scope = 'proposal' and not exists (
    select 1 from public.agent_proposals
    where id = p_scope_id
      and user_id = v_user_id
      and (
        status = 'executing'
        or (
          status = 'approved'
          and exists (
            select 1 from public.agent_action_executions execution
            where execution.user_id = v_user_id
              and execution.scope = 'proposal'
              and execution.scope_id = p_scope_id
              and execution.action_index = p_action_index
              and execution.action = p_action
          )
        )
      )
      and actions -> p_action_index = p_action
  ) then
    raise exception 'proposal action is not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_scope || ':' || p_scope_id::text || ':' || p_action_index::text,
      0
    )
  );

  select action, result
  into v_existing_action, v_existing_result
  from public.agent_action_executions
  where user_id = v_user_id
    and scope = p_scope
    and scope_id = p_scope_id
    and action_index = p_action_index;

  if found then
    if v_existing_action <> p_action then
      raise exception 'idempotency key reused with different action';
    end if;
    return v_existing_result;
  end if;

  if v_type = 'task.create' then
    v_title := pg_catalog.regexp_replace(
      pg_catalog.btrim(coalesce(p_action ->> 'title', '')),
      '[[:space:]]+', ' ', 'g'
    );
    v_notes := pg_catalog.regexp_replace(
      pg_catalog.btrim(coalesce(p_action ->> 'notes', '')),
      '[[:space:]]+', ' ', 'g'
    );
    if v_title = '' then
      v_result := jsonb_build_object(
        'ok', false, 'type', v_type, 'error', 'חסר שם למשימה.'
      );
    else
      v_due_on := nullif(p_action ->> 'due_on', '')::date;
      v_due_time := nullif(p_action ->> 'due_time', '')::time;
      if v_due_time is not null and v_due_on is null then
        v_result := jsonb_build_object(
          'ok', false, 'type', v_type,
          'error', 'אי אפשר לשמור שעה בלי תאריך.'
        );
      else
        v_due_at := case
          when v_due_on is not null and v_due_time is not null
          then (v_due_on + v_due_time) at time zone 'Asia/Jerusalem'
          else null
        end;
        select id into v_id
        from public.tasks
        where user_id = v_user_id
          and status = 'open'
          and pg_catalog.regexp_replace(pg_catalog.btrim(title), '[[:space:]]+', ' ', 'g') = v_title
          and pg_catalog.regexp_replace(pg_catalog.btrim(notes), '[[:space:]]+', ' ', 'g') = v_notes
          and due_on is not distinct from v_due_on
          and due_at is not distinct from v_due_at
        limit 1;
        if v_id is not null then
          v_result := jsonb_strip_nulls(jsonb_build_object(
            'ok', true, 'type', v_type, 'id', v_id,
            'title', v_title, 'due_on', v_due_on,
            'due_time', to_char(v_due_time, 'HH24:MI'),
            'alreadyExists', true
          ));
        else
          if p_action ->> 'plan_patch' = 'set' then
            v_planned_start :=
              (nullif(p_action ->> 'planned_date', '')::date
                + nullif(p_action ->> 'planned_start_time', '')::time)
              at time zone 'Asia/Jerusalem';
            v_planned_end := case
              when nullif(p_action ->> 'planned_end_time', '') is null then null
              else
                (nullif(p_action ->> 'planned_date', '')::date
                  + nullif(p_action ->> 'planned_end_time', '')::time)
                at time zone 'Asia/Jerusalem'
            end;
          end if;
          v_reminder_enabled := coalesce(
            (p_action ->> 'reminder_enabled')::boolean,
            true
          );
          v_reminder_offset :=
            nullif(p_action ->> 'reminder_offset_minutes', '')::integer;
          insert into public.tasks (
            user_id, title, notes, status, due_on, due_at,
            planned_start_at, planned_end_at, reminder_enabled,
            reminder_offset_minutes, updated_at
          ) values (
            v_user_id, v_title, v_notes, 'open', v_due_on, v_due_at,
            v_planned_start, v_planned_end, v_reminder_enabled,
            v_reminder_offset, now()
          )
          returning id into v_id;
          v_result := jsonb_strip_nulls(jsonb_build_object(
            'ok', true, 'type', v_type, 'id', v_id,
            'title', v_title, 'due_on', v_due_on,
            'due_time', to_char(v_due_time, 'HH24:MI')
          ));
        end if;
      end if;
    end if;

  elsif v_type in (
    'task.update', 'task.reschedule', 'task.complete',
    'task.reopen', 'task.delete'
  ) then
    v_id := nullif(p_action ->> 'id', '')::uuid;
    select * into v_current
    from public.tasks
    where id = v_id and user_id = v_user_id
    for update;
    if not found then
      v_result := jsonb_build_object(
        'ok', false, 'type', v_type, 'error', 'המשימה לא נמצאה.'
      );
    elsif v_type = 'task.complete' then
      update public.tasks
      set status = 'done', completed_at = now(), updated_at = now()
      where id = v_id and user_id = v_user_id;
      v_result := jsonb_build_object(
        'ok', true, 'type', v_type, 'id', v_id,
        'title', coalesce(p_action ->> 'title', v_current.title)
      );
    elsif v_type = 'task.reopen' then
      update public.tasks
      set status = 'open', completed_at = null, updated_at = now()
      where id = v_id and user_id = v_user_id;
      v_result := jsonb_build_object(
        'ok', true, 'type', v_type, 'id', v_id,
        'title', coalesce(p_action ->> 'title', v_current.title)
      );
    elsif v_type = 'task.delete' then
      update public.tasks
      set status = 'cancelled', updated_at = now()
      where id = v_id and user_id = v_user_id;
      v_result := jsonb_build_object(
        'ok', true, 'type', v_type, 'id', v_id,
        'title', coalesce(p_action ->> 'title', v_current.title)
      );
    elsif v_type = 'task.reschedule' then
      if p_action ->> 'due_patch' = 'clear' then
        v_due_on := null;
        v_due_time := null;
      else
        v_due_on := nullif(p_action ->> 'due_on', '')::date;
        v_due_time := nullif(p_action ->> 'due_time', '')::time;
      end if;
      if v_due_time is not null and v_due_on is null then
        v_result := jsonb_build_object(
          'ok', false, 'type', v_type,
          'error', 'אי אפשר לשמור שעה בלי תאריך.'
        );
      else
        v_due_at := case
          when v_due_on is not null and v_due_time is not null
          then (v_due_on + v_due_time) at time zone 'Asia/Jerusalem'
          else null
        end;
        update public.tasks
        set due_on = v_due_on,
            due_at = v_due_at,
            reschedule_count = reschedule_count
              + case when due_on is distinct from v_due_on
                  or due_at is distinct from v_due_at then 1 else 0 end,
            last_rescheduled_at = case
              when due_on is distinct from v_due_on
                or due_at is distinct from v_due_at then now()
              else last_rescheduled_at
            end,
            reminder_sent_at = case
              when due_at is distinct from v_due_at then null
              else reminder_sent_at
            end,
            reminder_claimed_at = case
              when due_at is distinct from v_due_at then null
              else reminder_claimed_at
            end,
            updated_at = now()
        where id = v_id and user_id = v_user_id;
        v_result := jsonb_strip_nulls(jsonb_build_object(
          'ok', true, 'type', v_type, 'id', v_id,
          'title', p_action ->> 'title', 'due_on', v_due_on,
          'due_time', to_char(v_due_time, 'HH24:MI')
        ));
      end if;
    else
      v_due_on := v_current.due_on;
      v_due_at := v_current.due_at;
      if p_action ->> 'due_patch' = 'clear' then
        v_due_on := null;
        v_due_at := null;
      elsif p_action ->> 'due_patch' = 'set' then
        v_due_on := nullif(p_action ->> 'due_on', '')::date;
        v_due_time := nullif(p_action ->> 'due_time', '')::time;
        if v_due_time is not null and v_due_on is null then
          v_result := jsonb_build_object(
            'ok', false, 'type', v_type,
            'error', 'אי אפשר לשמור שעה בלי תאריך.'
          );
        else
          v_due_at := case
            when v_due_on is not null and v_due_time is not null
            then (v_due_on + v_due_time) at time zone 'Asia/Jerusalem'
            else null
          end;
        end if;
      end if;
      if v_result is null then
        v_reminder_enabled := case
          when p_action ->> 'reminder_patch' = 'set'
          then coalesce((p_action ->> 'reminder_enabled')::boolean, true)
          else v_current.reminder_enabled
        end;
        v_reminder_offset := case
          when p_action ->> 'reminder_patch' = 'set'
          then nullif(p_action ->> 'reminder_offset_minutes', '')::integer
          else v_current.reminder_offset_minutes
        end;
        if p_action ->> 'plan_patch' = 'set' then
          v_planned_start :=
            (nullif(p_action ->> 'planned_date', '')::date
              + nullif(p_action ->> 'planned_start_time', '')::time)
            at time zone 'Asia/Jerusalem';
          v_planned_end := case
            when nullif(p_action ->> 'planned_end_time', '') is null then null
            else
              (nullif(p_action ->> 'planned_date', '')::date
                + nullif(p_action ->> 'planned_end_time', '')::time)
              at time zone 'Asia/Jerusalem'
          end;
        elsif p_action ->> 'plan_patch' = 'clear' then
          v_planned_start := null;
          v_planned_end := null;
        else
          v_planned_start := v_current.planned_start_at;
          v_planned_end := v_current.planned_end_at;
        end if;
        update public.tasks
        set title = case
              when nullif(p_action ->> 'title', '') is not null
              then pg_catalog.regexp_replace(
                pg_catalog.btrim(p_action ->> 'title'), '[[:space:]]+', ' ', 'g'
              )
              else title
            end,
            notes = case
              when p_action ->> 'notes' is not null
              then pg_catalog.regexp_replace(
                pg_catalog.btrim(p_action ->> 'notes'), '[[:space:]]+', ' ', 'g'
              )
              else notes
            end,
            due_on = v_due_on,
            due_at = v_due_at,
            reminder_enabled = v_reminder_enabled,
            reminder_offset_minutes = v_reminder_offset,
            planned_start_at = v_planned_start,
            planned_end_at = v_planned_end,
            reminder_sent_at = case
              when due_at is distinct from v_due_at
                or reminder_offset_minutes is distinct from v_reminder_offset
                or (not reminder_enabled and v_reminder_enabled)
              then null else reminder_sent_at
            end,
            reminder_claimed_at = case
              when due_at is distinct from v_due_at
                or reminder_offset_minutes is distinct from v_reminder_offset
                or (not reminder_enabled and v_reminder_enabled)
              then null else reminder_claimed_at
            end,
            updated_at = now()
        where id = v_id and user_id = v_user_id;
        v_result := jsonb_strip_nulls(jsonb_build_object(
          'ok', true, 'type', v_type, 'id', v_id,
          'title', p_action ->> 'title', 'due_on', v_due_on,
          'due_time', case when v_due_at is null then null
            else to_char(v_due_at at time zone 'Asia/Jerusalem', 'HH24:MI') end
        ));
      end if;
    end if;

  elsif v_type = 'memory.upsert' then
    v_title := pg_catalog.btrim(coalesce(p_action ->> 'content', ''));
    if v_title = '' then
      v_result := jsonb_build_object(
        'ok', false, 'type', v_type, 'error', 'חסר תוכן לזיכרון.'
      );
    else
      v_id := nullif(p_action ->> 'id', '')::uuid;
      if v_id is not null then
        update public.agent_memory
        set content = v_title,
            kind = coalesce(p_action ->> 'kind', 'preference'),
            confidence = coalesce(p_action ->> 'confidence', 'medium'),
            source = case when coalesce((p_action ->> 'silent')::boolean, false)
              then 'agent' else 'user' end,
            seen_at = case when coalesce((p_action ->> 'silent')::boolean, false)
              then null else now() end,
            updated_at = now()
        where id = v_id and user_id = v_user_id;
        if not found then
          v_result := jsonb_build_object(
            'ok', false, 'type', v_type, 'error', 'הזיכרון לא נמצא.'
          );
        end if;
      else
        insert into public.agent_memory (
          user_id, kind, content, confidence, source, seen_at, updated_at
        ) values (
          v_user_id,
          coalesce(p_action ->> 'kind', 'preference'),
          v_title,
          coalesce(p_action ->> 'confidence', 'medium'),
          case when coalesce((p_action ->> 'silent')::boolean, false)
            then 'agent' else 'user' end,
          case when coalesce((p_action ->> 'silent')::boolean, false)
            then null else now() end,
          now()
        )
        returning id into v_id;
      end if;
      if v_result is null then
        v_result := jsonb_build_object(
          'ok', true, 'type', v_type, 'id', v_id,
          'silent', coalesce((p_action ->> 'silent')::boolean, false)
        );
      end if;
    end if;

  elsif v_type = 'memory.remove' then
    v_id := nullif(p_action ->> 'id', '')::uuid;
    delete from public.agent_memory
    where id = v_id and user_id = v_user_id;
    if found then
      v_result := jsonb_build_object(
        'ok', true, 'type', v_type, 'id', v_id
      );
    else
      v_result := jsonb_build_object(
        'ok', false, 'type', v_type, 'error', 'הזיכרון לא נמצא.'
      );
    end if;
  else
    v_result := jsonb_build_object(
      'ok', false, 'type', 'invalid', 'error', 'סוג הפעולה אינו נתמך.'
    );
  end if;

  insert into public.agent_action_executions (
    user_id, scope, scope_id, action_index, action, result
  ) values (
    v_user_id, p_scope, p_scope_id, p_action_index, p_action, v_result
  );

  return v_result;
end;
$$;

revoke all on function private.execute_lean_action_idempotent_impl(
  text, uuid, integer, jsonb
) from public;
grant execute on function private.execute_lean_action_idempotent_impl(
  text, uuid, integer, jsonb
) to authenticated;

create or replace function public.execute_lean_action_idempotent(
  p_scope text,
  p_scope_id uuid,
  p_action_index integer,
  p_action jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.execute_lean_action_idempotent_impl(
    p_scope,
    p_scope_id,
    p_action_index,
    p_action
  );
$$;

revoke all on function public.execute_lean_action_idempotent(
  text, uuid, integer, jsonb
) from public;
grant execute on function public.execute_lean_action_idempotent(
  text, uuid, integer, jsonb
) to authenticated;
