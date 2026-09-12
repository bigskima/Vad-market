create or replace function public.admin_growth_account_search(p_search text)
returns table(user_id uuid,display_name text,handle text)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_search text:=lower(btrim(coalesce(p_search,'')));
begin
  if auth.uid() is null or not (
    private.is_super_admin()
    or private.has_permission('growth.manage')
  ) then
    raise exception 'Growth management permission required' using errcode='42501';
  end if;

  if char_length(v_search)<2 then return; end if;

  return query
  select
    ua.user_id,
    coalesce(nullif(p.display_name,''),'VAD member'),
    p.handle
  from public.user_accounts ua
  left join public.profiles p on p.user_id=ua.user_id
  where ua.status='ACTIVE'
    and (
      lower(coalesce(p.display_name,'')) like '%'||v_search||'%'
      or lower(coalesce(p.handle,'')) like '%'||v_search||'%'
      or ua.user_id::text=v_search
    )
  order by
    case when lower(coalesce(p.handle,''))=v_search then 0 else 1 end,
    coalesce(p.display_name,p.handle,'VAD member')
  limit 12;
end;
$$;

revoke all on function public.admin_growth_account_search(text) from public,anon;
grant execute on function public.admin_growth_account_search(text) to authenticated;