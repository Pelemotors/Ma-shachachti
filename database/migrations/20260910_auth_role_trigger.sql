drop trigger if exists on_auth_user_created_role on auth.users;
create trigger on_auth_user_created_role
  after insert on auth.users
  for each row
  execute function public.handle_new_user_role();

revoke execute on function public.handle_new_user_role() from public, anon, authenticated;
grant execute on function public.handle_new_user_role() to postgres, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.handle_new_user_role() to supabase_auth_admin';
  end if;
end $$;

revoke execute on function public.admin_set_user_access(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_user_access(uuid, text, boolean) to service_role;
