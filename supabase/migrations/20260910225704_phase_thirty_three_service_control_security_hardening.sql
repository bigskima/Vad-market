revoke execute on function private.my_service_control_snapshot() from authenticated;
revoke usage on schema private from authenticated;

create or replace function public.my_service_control_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  return private.my_service_control_snapshot();
end;
$$;

revoke all on function public.my_service_control_snapshot() from public, anon;
grant execute on function public.my_service_control_snapshot() to authenticated;
