begin;
revoke all on function public.idempotent_save_app_state(jsonb,bigint,uuid) from public,anon,authenticated;
drop function if exists public.idempotent_save_app_state(jsonb,bigint,uuid);
commit;
