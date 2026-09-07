create or replace function public.admin_set_user_access(p_user uuid,p_role text,p_approved boolean)
returns public.user_roles
language plpgsql security definer set search_path=public as $$
declare v_current public.user_roles; v_admins integer;
begin
  perform pg_advisory_xact_lock(84620260907);
  if p_role not in ('user','admin') then raise exception 'invalid_role'; end if;
  select * into v_current from public.user_roles where user_id=p_user for update;
  if v_current.role='admin' and v_current.approved and (p_role<>'admin' or not p_approved) then
    select count(*) into v_admins from public.user_roles where role='admin' and approved;
    if v_admins<=1 then raise exception 'last_admin'; end if;
  end if;
  insert into public.user_roles(user_id,role,approved,updated_at)
  values(p_user,p_role,p_approved,now())
  on conflict(user_id) do update set role=excluded.role,approved=excluded.approved,updated_at=now();
  return (select ur from public.user_roles ur where ur.user_id=p_user);
end $$;
revoke all on function public.admin_set_user_access(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_set_user_access(uuid,text,boolean) to service_role;
revoke all on function public.is_admin(uuid) from public,anon;
grant execute on function public.is_admin(uuid) to authenticated,service_role;
