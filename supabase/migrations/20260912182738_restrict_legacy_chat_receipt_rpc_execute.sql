-- Applied to managed Supabase Production on 2026-09-12.
-- Supabase migration history version: 20260912182738
-- Name: restrict_legacy_chat_receipt_rpc_execute
--
-- Dependency audit:
-- feature SHA 372a0a9e... and Production main SHA 39e5c8b...
-- use public.agent_turns directly and do not call these legacy RPCs.

revoke execute on function public.claim_chat_receipt(uuid, uuid, text)
from anon, authenticated;

revoke execute on function public.complete_chat_receipt(uuid, uuid, text, jsonb, text)
from anon, authenticated;
