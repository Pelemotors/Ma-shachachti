-- Persistent Smith chat feedback. Local-first; not approved for hosted use.

alter table smith_control.smith_chat_messages
add column client_message_id text;

create unique index smith_chat_messages_client_message_unique
on smith_control.smith_chat_messages(thread_id, client_message_id)
where client_message_id is not null;

create table smith_control.smith_feedback (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid references smith_control.smith_work_items(id)
    on delete cascade,
  thread_id uuid references smith_control.smith_chat_threads(id)
    on delete set null,
  message_id uuid references smith_control.smith_chat_messages(id)
    on delete set null,
  admin_user_id uuid not null,
  kind text not null
    check (kind in ('useful', 'not_useful', 'correction', 'follow_up')),
  content text not null default '',
  status text not null default 'received'
    check (status in ('received', 'queued', 'incorporated', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table smith_control.smith_feedback enable row level security;
alter table smith_control.smith_feedback force row level security;
revoke all on smith_control.smith_feedback
from public, anon, authenticated, smith_test;
grant select, insert, update, delete on smith_control.smith_feedback
to service_role;

create index smith_feedback_work_item_created_idx
on smith_control.smith_feedback(work_item_id, created_at desc);
