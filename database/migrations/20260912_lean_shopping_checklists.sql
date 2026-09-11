-- Phase 6 source-of-truth cutover: app_states remains an immutable legacy
-- source. After this one-way, idempotent copy, Lean reads and writes only the
-- normalized tables below. Re-running never overwrites newer Lean edits.
create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  quantity integer not null default 1 check (quantity between 1 and 999),
  purchased_at timestamptz,
  order_index integer not null default 0 check (order_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  order_index integer not null default 0 check (order_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 500),
  checked boolean not null default false,
  order_index integer not null default 0 check (order_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, checklist_id)
    references public.checklists(user_id, id) on delete cascade
);

create index if not exists shopping_items_user_order_idx
  on public.shopping_items(user_id, order_index, created_at);
create index if not exists checklists_user_order_idx
  on public.checklists(user_id, order_index, created_at);
create index if not exists checklist_items_list_order_idx
  on public.checklist_items(user_id, checklist_id, order_index, created_at);

alter table public.shopping_items enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;

do $policies$
declare
  table_name text;
  operation text;
begin
  foreach table_name in array array['shopping_items', 'checklists', 'checklist_items']
  loop
    foreach operation in array array['select', 'insert', 'update', 'delete']
    loop
      execute format('drop policy if exists %I on public.%I',
        table_name || '_' || operation || '_own', table_name);
      if operation = 'insert' then
        execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
          table_name || '_' || operation || '_own', table_name);
      elsif operation = 'update' then
        execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
          table_name || '_' || operation || '_own', table_name);
      else
        execute format('create policy %I on public.%I for %s to authenticated using ((select auth.uid()) = user_id)',
          table_name || '_' || operation || '_own', table_name, operation);
      end if;
    end loop;
  end loop;
end
$policies$;

revoke all on public.shopping_items, public.checklists, public.checklist_items from anon;
grant select, insert, update, delete on public.shopping_items, public.checklists, public.checklist_items to authenticated;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.legacy_stable_uuid(
  owner_id uuid, entity_kind text, position integer, legacy_id text
) returns uuid
language sql immutable strict
set search_path = ''
as $$
  select (
    substr(v, 1, 8) || '-' || substr(v, 9, 4) || '-5' ||
    substr(v, 14, 3) || '-a' || substr(v, 18, 3) || '-' || substr(v, 21, 12)
  )::uuid
  from (select md5(owner_id::text || ':' || entity_kind || ':' ||
    position::text || ':' || legacy_id) v) hashes;
$$;

create or replace function private.legacy_uuid_or_stable(
  owner_id uuid, entity_kind text, position integer, legacy_id jsonb
) returns uuid
language plpgsql immutable
set search_path = ''
as $$
declare raw text;
begin
  raw := '';
  if legacy_id is not null and jsonb_typeof(legacy_id) = 'string' then
    raw := legacy_id #>> '{}';
  end if;
  if raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then return raw::uuid;
  end if;
  return private.legacy_stable_uuid(owner_id, entity_kind, position, raw);
end;
$$;

create or replace function private.legacy_timestamp(value jsonb, fallback timestamptz)
returns timestamptz
language plpgsql immutable
set search_path = ''
as $$
declare raw text;
begin
  if value is null or jsonb_typeof(value) <> 'string' then return fallback; end if;
  raw := value #>> '{}';
  if raw !~ '^\d{4}-\d\d-\d\dT' then return fallback; end if;
  begin return raw::timestamptz; exception when others then return fallback; end;
end;
$$;

do $migration$
declare
  state record;
  shopping jsonb;
  lists jsonb;
  list_value jsonb;
  item_value jsonb;
  list_id uuid;
  created timestamptz;
  list_position integer;
  item_position integer;
begin
  -- Dynamic discovery makes a missing legacy table a safe no-op.
  if to_regclass('public.app_states') is null then return; end if;
  for state in execute
    'select owner_id, data, updated_at from public.app_states'
  loop
    if state.owner_id is null or jsonb_typeof(state.data) <> 'object' then continue; end if;
    shopping := state.data -> 'shopping';
    if jsonb_typeof(shopping) = 'array' then
      for item_value, item_position in
        select value, (ordinality - 1)::integer
        from jsonb_array_elements(shopping) with ordinality
      loop
        if jsonb_typeof(item_value) <> 'object'
          or jsonb_typeof(item_value -> 'title') <> 'string'
          or char_length(btrim(item_value ->> 'title')) not between 1 and 200
        then continue; end if;
        created := private.legacy_timestamp(item_value -> 'createdAt', coalesce(state.updated_at, '1970-01-01Z'::timestamptz));
        insert into public.shopping_items(
          id, user_id, title, quantity, purchased_at, order_index, created_at, updated_at
        ) values (
          private.legacy_uuid_or_stable(state.owner_id, 'shopping', item_position, item_value -> 'id'),
          state.owner_id, btrim(item_value ->> 'title'),
          case
            when jsonb_typeof(item_value -> 'quantity') in ('number', 'string')
            then case
              when btrim(item_value ->> 'quantity') ~ '^[0-9]+$'
              then case
                when btrim(item_value ->> 'quantity')::numeric between 1 and 999
                then btrim(item_value ->> 'quantity')::integer
                else 1
              end
              else 1
            end
            else 1
          end,
          case when item_value -> 'purchasedAt' = 'null'::jsonb then null
            else private.legacy_timestamp(item_value -> 'purchasedAt', null) end,
          item_position, created, created
        ) on conflict do nothing;
      end loop;
    end if;

    lists := state.data -> 'checklists';
    if jsonb_typeof(lists) = 'array' then
      for list_value, list_position in
        select value, (ordinality - 1)::integer
        from jsonb_array_elements(lists) with ordinality
      loop
        if jsonb_typeof(list_value) <> 'object'
          or jsonb_typeof(list_value -> 'title') <> 'string'
          or char_length(btrim(list_value ->> 'title')) not between 1 and 200
        then continue; end if;
        list_id := private.legacy_uuid_or_stable(state.owner_id, 'checklist', list_position, list_value -> 'id');
        created := private.legacy_timestamp(list_value -> 'createdAt', coalesce(state.updated_at, '1970-01-01Z'::timestamptz));
        insert into public.checklists(id, user_id, title, order_index, created_at, updated_at)
        values (
          list_id, state.owner_id, btrim(list_value ->> 'title'), list_position,
          created, private.legacy_timestamp(list_value -> 'updatedAt', created)
        ) on conflict do nothing;

        if jsonb_typeof(list_value -> 'items') = 'array' then
          for item_value, item_position in
            select value, (ordinality - 1)::integer
            from jsonb_array_elements(list_value -> 'items') with ordinality
          loop
            if jsonb_typeof(item_value) <> 'object'
              or jsonb_typeof(item_value -> 'text') <> 'string'
              or char_length(btrim(item_value ->> 'text')) not between 1 and 500
            then continue; end if;
            created := private.legacy_timestamp(item_value -> 'createdAt', coalesce(state.updated_at, '1970-01-01Z'::timestamptz));
            insert into public.checklist_items(
              id, checklist_id, user_id, text, checked, order_index, created_at, updated_at
            ) values (
              private.legacy_uuid_or_stable(state.owner_id, 'checklist-item:' || list_id, item_position, item_value -> 'id'),
              list_id, state.owner_id, btrim(item_value ->> 'text'),
              case when jsonb_typeof(item_value -> 'checked') = 'boolean'
                then (item_value ->> 'checked')::boolean else false end,
              case when jsonb_typeof(item_value -> 'order') = 'number'
                and (item_value ->> 'order')::numeric >= 0
                then (item_value ->> 'order')::integer else item_position end,
              created, private.legacy_timestamp(item_value -> 'updatedAt', created)
            ) on conflict do nothing;
          end loop;
        end if;
      end loop;
    end if;
  end loop;
end
$migration$;

-- app_states is deliberately neither updated nor deleted. It can be retired
-- only after production count verification and the runtime cutover.
