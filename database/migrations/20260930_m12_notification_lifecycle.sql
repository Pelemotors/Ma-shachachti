-- M12: additive reminder lifecycle state. Existing inbox rows remain active.
alter table public.app_notifications
  add column if not exists state text not null default 'active',
  add column if not exists remind_at timestamptz,
  add column if not exists snoozed_until timestamptz,
  add column if not exists handled_at timestamptz,
  add column if not exists cancelled_at timestamptz;

do $$ begin
  alter table public.app_notifications
    add constraint app_notifications_state_check
    check (state in ('active', 'missed', 'snoozed', 'handled', 'cancelled'));
exception when duplicate_object then null;
end $$;

create index if not exists app_notifications_state_idx
  on public.app_notifications(user_id, state, created_at desc);
