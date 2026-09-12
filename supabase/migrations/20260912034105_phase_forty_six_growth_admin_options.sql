create or replace function public.admin_growth_options()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not (
    private.is_super_admin()
    or private.has_permission('growth.read')
    or private.has_permission('growth.manage')
  ) then
    raise exception 'Growth access required' using errcode='42501';
  end if;

  return jsonb_build_object(
    'assets',coalesce((
      select jsonb_agg(jsonb_build_object('code',a.code,'name',a.name) order by a.code)
      from public.assets a
      where a.status='ACTIVE'
    ),'[]'::jsonb),
    'countries',coalesce((
      select jsonb_agg(jsonb_build_object('code',j.country_code,'name',j.name) order by j.name)
      from public.jurisdictions j
      where j.status='ACTIVE'
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_growth_options() from public,anon;
grant execute on function public.admin_growth_options() to authenticated;