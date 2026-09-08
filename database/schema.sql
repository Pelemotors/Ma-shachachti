-- Run once in a NEW dedicated Supabase project. No existing project is modified by this repository.
begin;
create table if not exists public.app_states (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null check (jsonb_typeof(data)='object' and octet_length(data::text)<2000000),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.app_states enable row level security;
create policy own_state on public.app_states for all to authenticated
 using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
grant select,insert,update,delete on public.app_states to authenticated;

create table if not exists public.push_subscriptions (
 owner_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null check(length(endpoint)<2000), subscription jsonb not null,
 created_at timestamptz not null default now(),primary key(owner_id,endpoint)
);
alter table public.push_subscriptions enable row level security;
create policy own_push on public.push_subscriptions for all to authenticated
 using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
grant select,insert,update,delete on public.push_subscriptions to authenticated;

create table if not exists public.reminder_queue (
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 due_at timestamptz not null,status text not null default 'pending' check(status in ('pending','sent','failed','cancelled')),
 attempts integer not null default 0,lease_until timestamptz,delivered_at timestamptz,last_error text
);
create index reminders_due on public.reminder_queue(due_at) where status='pending';
create index reminders_owner on public.reminder_queue(owner_id);
alter table public.reminder_queue enable row level security;
create policy own_reminders on public.reminder_queue for all to authenticated
 using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
grant select,insert,update,delete on public.reminder_queue to authenticated;

create or replace function public.save_app_state(p_data jsonb,p_expected_revision bigint)
returns bigint language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_revision bigint; v_owner uuid:=auth.uid();
begin
 if v_owner is null then raise exception 'unauthorized'; end if;
 if p_data->>'schemaVersion' not in ('1','2') or jsonb_typeof(p_data->'reminders')<>'array' then raise exception 'invalid_state'; end if;
 if p_expected_revision=0 then
  insert into app_states(owner_id,data,revision) values(v_owner,p_data,1) on conflict do nothing returning revision into v_revision;
 else
  update app_states set data=p_data,revision=revision+1,updated_at=now() where owner_id=v_owner and revision=p_expected_revision returning revision into v_revision;
 end if;
 if v_revision is null then raise exception 'revision_conflict'; end if;
 insert into reminder_queue(id,owner_id,due_at,status)
 select (r->>'id')::uuid,v_owner,(r->>'dueAt')::timestamptz,
 case when r->>'status'='cancelled' then 'cancelled' else 'pending' end
 from jsonb_array_elements(p_data->'reminders') r
 on conflict(id) do update set due_at=excluded.due_at,
 status=case when excluded.status='cancelled' then 'cancelled' when reminder_queue.status in ('sent','failed') then reminder_queue.status else excluded.status end,
 lease_until=case when reminder_queue.due_at is distinct from excluded.due_at then null else reminder_queue.lease_until end
 where reminder_queue.owner_id=v_owner;
 update reminder_queue set status='cancelled' where owner_id=v_owner and status='pending'
 and id not in(select (r->>'id')::uuid from jsonb_array_elements(p_data->'reminders') r);
 return v_revision;
end;$$;
revoke all on function public.save_app_state(jsonb,bigint) from public,anon;
grant execute on function public.save_app_state(jsonb,bigint) to authenticated;

create table if not exists public.ai_budgets(owner_id uuid not null references auth.users(id) on delete cascade,kind text not null,bucket timestamptz not null,used integer not null,primary key(owner_id,kind,bucket));
alter table public.ai_budgets enable row level security;
-- No client policy. Only server-side service role can consume quota.
create or replace function public.consume_ai_budget(p_owner uuid,p_kind text,p_limit integer)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;
begin
 insert into ai_budgets values(p_owner,p_kind,date_trunc('hour',now()),1)
 on conflict(owner_id,kind,bucket) do update set used=ai_budgets.used+1 returning used into n;
 return n<=p_limit;
end;$$;
revoke all on function public.consume_ai_budget(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.consume_ai_budget(uuid,text,integer) to service_role;
grant all on public.ai_budgets to service_role;

create or replace function public.claim_due_reminders()
returns setof public.reminder_queue language sql security invoker set search_path=public,pg_temp as $$
 update reminder_queue set lease_until=now()+interval '3 minutes',attempts=attempts+1
 where id in(select id from reminder_queue where status='pending' and due_at<=now() and (lease_until is null or lease_until<now()) and attempts<5 order by due_at limit 10 for update skip locked)
 returning *;
$$;
revoke all on function public.claim_due_reminders() from public,anon,authenticated;
grant execute on function public.claim_due_reminders() to service_role;
grant all on public.app_states,public.reminder_queue,public.push_subscriptions to service_role;

create table if not exists public.pending_proposals (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 turn_id uuid,
 type text not null,
 payload jsonb not null,
 source_revision bigint not null default 0,
 status text not null default 'pending'
  check (status in ('pending','accepted','partial','declined','expired')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists pending_proposals_owner_idx
 on public.pending_proposals(owner_id,status,expires_at);
alter table public.pending_proposals enable row level security;
create policy pending_proposals_owner_all on public.pending_proposals for all to authenticated
 using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
grant select,insert,update,delete on public.pending_proposals to authenticated;
grant all on public.pending_proposals to service_role;
commit;
