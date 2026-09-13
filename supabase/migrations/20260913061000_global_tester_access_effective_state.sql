create or replace function public.admin_kyc_access_overrides_v2(
  p_search text default null,
  p_limit integer default 100
) returns table(
  user_id uuid,
  email text,
  display_name text,
  country_code text,
  provider_kyc_status text,
  verification_level text,
  provider_code text,
  override_enabled boolean,
  override_scope text,
  override_reason text,
  override_expires_at timestamptz,
  override_updated_at timestamptz,
  global_override_enabled boolean,
  global_override_scope text,
  effective_sandbox_override boolean,
  effective_production_override boolean
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not (
    private.is_super_admin()
    or private.has_permission('compliance.manage')
    or private.has_permission('users.manage')
  ) then
    raise exception 'Compliance or user management permission required' using errcode='42501';
  end if;

  return query
  with latest_kyc as (
    select distinct on (k.user_id)
      k.user_id,
      k.status,
      k.verification_level,
      p.code as provider_code
    from compliance.kyc_cases k
    left join integration.providers p on p.id=k.provider_id
    order by k.user_id,k.created_at desc,k.id desc
  ),
  global_access as (
    select
      (g.enabled and (g.expires_at is null or g.expires_at>statement_timestamp())) as enabled,
      g.scope
    from compliance.kyc_global_access_override g
    where g.singleton
    limit 1
  )
  select
    a.id,
    a.email::text,
    coalesce(nullif(pr.display_name,''),nullif(pr.handle,''),split_part(coalesce(a.email,''),'@',1))::text,
    ua.country_code,
    coalesce(k.status,'NOT_STARTED')::text,
    coalesce(k.verification_level,'NONE')::text,
    k.provider_code::text,
    (coalesce(o.enabled,false) and (o.expires_at is null or o.expires_at>statement_timestamp())) as override_enabled,
    o.scope::text,
    o.reason::text,
    o.expires_at,
    o.updated_at,
    coalesce(g.enabled,false) as global_override_enabled,
    case when coalesce(g.enabled,false) then g.scope::text else null end as global_override_scope,
    private.tester_access_satisfies(a.id,'SANDBOX') as effective_sandbox_override,
    private.tester_access_satisfies(a.id,'PRODUCTION') as effective_production_override
  from auth.users a
  left join public.user_accounts ua on ua.user_id=a.id
  left join public.profiles pr on pr.user_id=a.id
  left join latest_kyc k on k.user_id=a.id
  left join compliance.kyc_access_overrides o on o.user_id=a.id
  left join global_access g on true
  where nullif(btrim(coalesce(p_search,'')),'') is null
     or lower(coalesce(a.email,'')) like '%'||lower(btrim(p_search))||'%'
     or lower(coalesce(pr.display_name,'')) like '%'||lower(btrim(p_search))||'%'
     or lower(coalesce(pr.handle,'')) like '%'||lower(btrim(p_search))||'%'
  order by coalesce(o.updated_at,a.created_at) desc
  limit greatest(1,least(coalesce(p_limit,100),250));
end;
$$;

revoke all on function public.admin_kyc_access_overrides_v2(text,integer) from public,anon;
grant execute on function public.admin_kyc_access_overrides_v2(text,integer) to authenticated;
