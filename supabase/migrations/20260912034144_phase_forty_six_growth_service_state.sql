create or replace function public.my_growth_service_state()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode='42501';
  end if;

  return private.service_control_state('growth_rewards',auth.uid());
end;
$$;

revoke all on function public.my_growth_service_state() from public,anon;
grant execute on function public.my_growth_service_state() to authenticated;