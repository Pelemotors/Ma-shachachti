-- Supabase project defaults may grant broader table/function privileges than
-- Lean needs. Revoke them explicitly, then restore only the runtime contract.
revoke all on table
  public.user_profiles,
  public.shopping_items,
  public.checklists,
  public.checklist_items,
  public.recordings,
  public.agent_turns,
  public.agent_proposals,
  public.agent_action_executions
from anon, authenticated;

grant select, insert, update
  on table public.user_profiles
  to authenticated;

grant select, insert, update, delete
  on table
    public.shopping_items,
    public.checklists,
    public.checklist_items,
    public.recordings
  to authenticated;

grant select, insert, update
  on table public.agent_turns, public.agent_proposals
  to authenticated;

grant select
  on table public.agent_action_executions
  to authenticated;

revoke all on function public.execute_lean_action_idempotent(
  text, uuid, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.execute_lean_action_idempotent(
  text, uuid, integer, jsonb
) to authenticated;

revoke all on function private.execute_lean_action_idempotent_impl(
  text, uuid, integer, jsonb
) from public, anon, authenticated;
grant execute on function private.execute_lean_action_idempotent_impl(
  text, uuid, integer, jsonb
) to authenticated;

-- Migration-only helpers must not remain callable through the private schema
-- usage that the runtime action wrapper requires.
revoke all on function private.legacy_stable_uuid(
  uuid, text, integer, text
) from public, anon, authenticated;
revoke all on function private.legacy_uuid_or_stable(
  uuid, text, integer, jsonb
) from public, anon, authenticated;
revoke all on function private.legacy_timestamp(
  jsonb, timestamptz
) from public, anon, authenticated;

create index if not exists agent_turns_user_session_idx
  on public.agent_turns(user_id, session_id);

create index if not exists agent_proposals_user_session_idx
  on public.agent_proposals(user_id, session_id);
