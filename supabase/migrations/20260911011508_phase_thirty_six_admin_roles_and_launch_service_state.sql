-- VAD Phase 36: restore Super Admin role administration and make launch service state explicit.
--
-- 1) admin_role_assignments previously returned auth.users.email (varchar) from a
--    PL/pgSQL TABLE function declared as text. PostgreSQL requires the RETURN QUERY
--    row structure to match exactly, which caused the Roles & Access screen error:
--    "structure of query does not match function result type".
-- 2) Keep non-money product services available while monetary execution remains
--    deliberately paused until payment/funding rails are explicitly activated.

create or replace function public.admin_role_assignments(p_search text default null)
returns table(
  assignment_id bigint,
  user_id uuid,
  email text,
  display_name text,
  role_code text,
  role_name text,
  reason text,
  effective_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.has_permission('admin.roles.manage') then
    raise exception 'Permission required' using errcode='42501';
  end if;

  return query
  select
    ur.id,
    ur.user_id,
    u.email::text,
    p.display_name::text,
    r.code::text,
    r.name::text,
    ur.reason::text,
    ur.effective_at,
    ur.expires_at
  from admin.user_roles ur
  join admin.roles r on r.id=ur.role_id
  join auth.users u on u.id=ur.user_id
  left join public.profiles p on p.user_id=ur.user_id
  where ur.revoked_at is null
    and ur.effective_at<=statement_timestamp()
    and (ur.expires_at is null or ur.expires_at>statement_timestamp())
    and (
      nullif(trim(coalesce(p_search,'')),'') is null
      or lower(coalesce(u.email,'')) like '%'||lower(trim(p_search))||'%'
      or lower(coalesce(p.display_name,'')) like '%'||lower(trim(p_search))||'%'
      or lower(r.code) like '%'||lower(trim(p_search))||'%'
    )
  order by r.id,u.email;
end;
$$;

revoke all on function public.admin_role_assignments(text) from public,anon;
grant execute on function public.admin_role_assignments(text) to authenticated;

-- Super Admin remains the authority boundary for role assignment. The ordinary
-- assignment RPC intentionally cannot grant or revoke SUPER_ADMIN itself.
-- Keep every existing permission attached to SUPER_ADMIN so the catalogue is
-- complete for inspection; private.has_permission() also treats SUPER_ADMIN as
-- authoritative for future permissions.
insert into admin.role_permissions(role_id,permission_id)
select r.id,p.id
from admin.roles r
cross join admin.permissions p
where r.code='SUPER_ADMIN'
on conflict do nothing;

-- Explicit launch posture: all non-money services should be available. Clearing a
-- global pause preserves any user-specific safety restriction while restoring the
-- general service. Monetary execution remains globally paused and can later be
-- resumed from Service Controls by Super Admin without another migration.
insert into control.service_overrides(service_key,scope_type,user_id,paused,reason,resumes_at,changed_by)
select s.service_key,'GLOBAL',null,false,'Enabled for VAD launch operations',null,null
from control.services s
where s.status='ACTIVE'
  and s.service_key not in ('deposits','withdrawals','settlement','trading')
on conflict(service_key) where scope_type='GLOBAL'
do update set
  paused=false,
  reason='Enabled for VAD launch operations',
  resumes_at=null,
  changed_by=null,
  updated_at=statement_timestamp();

insert into control.service_overrides(service_key,scope_type,user_id,paused,reason,resumes_at,changed_by)
select s.service_key,'GLOBAL',null,true,'Money movement is intentionally disabled until VAD funding and payment rails are explicitly activated',null,null
from control.services s
where s.status='ACTIVE'
  and s.service_key in ('deposits','withdrawals','settlement','trading')
on conflict(service_key) where scope_type='GLOBAL'
do update set
  paused=true,
  reason='Money movement is intentionally disabled until VAD funding and payment rails are explicitly activated',
  resumes_at=null,
  changed_by=null,
  updated_at=statement_timestamp();

-- System audit evidence for the launch-state change. One record per service keeps
-- the control history inspectable without impersonating a human administrator.
insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,after_state,metadata)
select null,'SYSTEM',
       case when s.service_key in ('deposits','withdrawals','settlement','trading') then 'SERVICE_PAUSED' else 'SERVICE_RESUMED' end,
       'SERVICE_CONTROL',
       s.service_key||':GLOBAL',
       case when s.service_key in ('deposits','withdrawals','settlement','trading')
         then 'Money movement is intentionally disabled until VAD funding and payment rails are explicitly activated'
         else 'Enabled for VAD launch operations'
       end,
       jsonb_build_object('paused',s.service_key in ('deposits','withdrawals','settlement','trading')),
       jsonb_build_object('phase','36','scope','GLOBAL','launch_state',true)
from control.services s
where s.status='ACTIVE';
