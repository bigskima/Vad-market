-- VAD Phase 37: permission-safe operational posture for every active admin.
-- Scoped admins may see whether platform services are available, but only Super Admin
-- can mutate emergency service controls. This keeps the dashboard truthful without
-- widening operational authority.

create or replace function public.admin_service_posture()
returns table(
  service_key text,
  name text,
  category text,
  enabled boolean,
  globally_paused boolean,
  reason text,
  resumes_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not (
    private.is_super_admin()
    or exists (
      select 1
      from admin.user_roles ur
      where ur.user_id=auth.uid()
        and ur.revoked_at is null
        and ur.effective_at<=statement_timestamp()
        and (ur.expires_at is null or ur.expires_at>statement_timestamp())
    )
  ) then
    raise exception 'Admin access required' using errcode='42501';
  end if;

  return query
  select
    s.service_key,
    s.name,
    s.category,
    case
      when coalesce(app_pause.paused,false)
        and s.inherits_app_pause
        and (app_pause.resumes_at is null or app_pause.resumes_at>statement_timestamp())
        then false
      when coalesce(g.paused,false)
        and (g.resumes_at is null or g.resumes_at>statement_timestamp())
        then false
      else s.default_enabled
    end as enabled,
    coalesce(
      g.paused and (g.resumes_at is null or g.resumes_at>statement_timestamp()),
      false
    ) as globally_paused,
    case
      when g.paused and (g.resumes_at is null or g.resumes_at>statement_timestamp()) then g.reason
      when app_pause.paused and s.inherits_app_pause and (app_pause.resumes_at is null or app_pause.resumes_at>statement_timestamp()) then app_pause.reason
      else null
    end as reason,
    case
      when g.paused and (g.resumes_at is null or g.resumes_at>statement_timestamp()) then g.resumes_at
      when app_pause.paused and s.inherits_app_pause and (app_pause.resumes_at is null or app_pause.resumes_at>statement_timestamp()) then app_pause.resumes_at
      else null
    end as resumes_at
  from control.services s
  left join control.service_overrides g
    on g.service_key=s.service_key and g.scope_type='GLOBAL'
  left join control.service_overrides app_pause
    on app_pause.service_key='app_access' and app_pause.scope_type='GLOBAL'
  where s.status='ACTIVE'
  order by
    case s.category
      when 'Platform' then 0
      when 'Trust & Safety' then 1
      when 'Markets' then 2
      when 'Community' then 3
      when 'Money' then 4
      else 5
    end,
    s.name;
end;
$$;

revoke all on function public.admin_service_posture() from public,anon;
grant execute on function public.admin_service_posture() to authenticated;

-- Expose the role-to-permission matrix to Super Admin so assignment decisions are
-- driven by backend authority instead of duplicated frontend assumptions.
create or replace function public.admin_role_permission_matrix()
returns table(
  role_code text,
  role_name text,
  permission_code text,
  permission_description text
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not private.has_permission('admin.roles.manage') then
    raise exception 'Permission required' using errcode='42501';
  end if;

  return query
  select r.code::text,r.name::text,p.code::text,p.description::text
  from admin.roles r
  left join admin.role_permissions rp on rp.role_id=r.id
  left join admin.permissions p on p.id=rp.permission_id
  order by r.id,p.code;
end;
$$;

revoke all on function public.admin_role_permission_matrix() from public,anon;
grant execute on function public.admin_role_permission_matrix() to authenticated;
