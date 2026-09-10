-- Phase 25 continuation: operational role assignment and market review controls.

create or replace function public.admin_role_catalog()
returns table(
  role_code text,
  role_name text,
  description text,
  is_system boolean,
  assigned_count bigint
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
  select r.code,r.name,r.description,r.is_system,
         count(ur.id) filter (
           where ur.revoked_at is null
             and ur.effective_at<=statement_timestamp()
             and (ur.expires_at is null or ur.expires_at>statement_timestamp())
         )
  from admin.roles r
  left join admin.user_roles ur on ur.role_id=r.id
  group by r.id,r.code,r.name,r.description,r.is_system
  order by r.id;
end;
$$;

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
  select ur.id,ur.user_id,u.email,p.display_name,r.code,r.name,ur.reason,ur.effective_at,ur.expires_at
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

create or replace function public.admin_assign_role(
  p_user_id uuid,
  p_role_code text,
  p_reason text,
  p_expires_at timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  target_role admin.roles;
  assignment_id bigint;
begin
  if not private.has_permission('admin.roles.manage') then
    raise exception 'Permission required' using errcode='42501';
  end if;
  if p_reason is null or char_length(trim(p_reason))<3 then
    raise exception 'Reason required' using errcode='22023';
  end if;
  if not exists(select 1 from auth.users where id=p_user_id) then
    raise exception 'User not found' using errcode='P0002';
  end if;

  select * into target_role from admin.roles where code=upper(trim(p_role_code));
  if target_role.id is null then raise exception 'Role not found' using errcode='P0002'; end if;
  if target_role.code='SUPER_ADMIN' then
    raise exception 'Super Admin elevation requires the platform bootstrap / dual-control procedure' using errcode='42501';
  end if;
  if p_expires_at is not null and p_expires_at<=statement_timestamp() then
    raise exception 'Role expiry must be in the future' using errcode='22023';
  end if;
  if exists(select 1 from admin.user_roles where user_id=p_user_id and role_id=target_role.id and revoked_at is null) then
    raise exception 'User already has this role' using errcode='P0001';
  end if;

  -- Scoped roles are direct Super Admin appointments. Attribution is kept in
  -- the immutable audit record; null maker/checker fields preserve the existing
  -- table constraint that distinguishes these appointments from dual-control grants.
  insert into admin.user_roles(user_id,role_id,assigned_by,approved_by,reason,effective_at,expires_at)
  values(p_user_id,target_role.id,null,null,trim(p_reason),statement_timestamp(),p_expires_at)
  returning id into assignment_id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,after_state,metadata)
  values(auth.uid(),'ADMIN','ADMIN_ROLE_ASSIGNED','USER',p_user_id::text,trim(p_reason),
         jsonb_build_object('role_code',target_role.code,'expires_at',p_expires_at),
         jsonb_build_object('assignment_id',assignment_id));

  return assignment_id;
end;
$$;

create or replace function public.admin_revoke_role(p_assignment_id bigint,p_reason text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  assignment admin.user_roles;
  target_role admin.roles;
begin
  if not private.has_permission('admin.roles.manage') then
    raise exception 'Permission required' using errcode='42501';
  end if;
  if p_reason is null or char_length(trim(p_reason))<3 then
    raise exception 'Reason required' using errcode='22023';
  end if;

  select * into assignment from admin.user_roles where id=p_assignment_id for update;
  if assignment.id is null or assignment.revoked_at is not null then
    raise exception 'Active role assignment not found' using errcode='P0002';
  end if;
  select * into target_role from admin.roles where id=assignment.role_id;
  if target_role.code='SUPER_ADMIN' then
    raise exception 'Super Admin revocation requires the platform dual-control procedure' using errcode='42501';
  end if;

  update admin.user_roles
  set revoked_at=statement_timestamp(),revoked_by=auth.uid()
  where id=assignment.id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,before_state,after_state,metadata)
  values(auth.uid(),'ADMIN','ADMIN_ROLE_REVOKED','USER',assignment.user_id::text,trim(p_reason),
         jsonb_build_object('role_code',target_role.code,'assignment_id',assignment.id),
         jsonb_build_object('revoked',true),
         jsonb_build_object('assignment_id',assignment.id));
  return true;
end;
$$;

create or replace function public.admin_market_approval_options()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if not private.has_permission('markets.manage') then
    raise exception 'Permission required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'templates',coalesce((select jsonb_agg(jsonb_build_object('code',t.code,'name',t.name) order by t.code) from market.templates t where t.status='ACTIVE'),'[]'::jsonb),
    'oraclePolicies',coalesce((select jsonb_agg(jsonb_build_object('publicId',p.public_id,'name',p.name,'version',p.version) order by p.name,p.version desc) from oracle.policies p where p.status='ACTIVE' and p.effective_at<=statement_timestamp()),'[]'::jsonb),
    'jurisdictions',coalesce((select jsonb_agg(jsonb_build_object('countryCode',j.country_code,'name',j.name,'assets',coalesce((select jsonb_agg(a.code order by a.code) from public.jurisdiction_assets ja join public.assets a on a.id=ja.asset_id where ja.jurisdiction_id=j.id and ja.status='ACTIVE' and a.status='ACTIVE'),'[]'::jsonb)) order by j.country_code) from public.jurisdictions j where j.status='ACTIVE'),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_decide_market_proposal(
  p_proposal_public_id uuid,
  p_decision text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  proposal market.proposals;
  decision text:=upper(trim(coalesce(p_decision,'')));
  next_status text;
begin
  if not private.has_permission('markets.manage') then
    raise exception 'Permission required' using errcode='42501';
  end if;
  if decision not in ('REJECT','NEEDS_CLARIFICATION') then
    raise exception 'Decision must be REJECT or NEEDS_CLARIFICATION' using errcode='22023';
  end if;
  if p_reason is null or char_length(trim(p_reason))<3 then
    raise exception 'Decision reason required' using errcode='22023';
  end if;

  select * into proposal from market.proposals where public_id=p_proposal_public_id for update;
  if proposal.id is null then raise exception 'Market proposal not found' using errcode='P0002'; end if;
  if proposal.status not in ('SUBMITTED','PROCESSING','UNDER_REVIEW','NEEDS_CLARIFICATION') then
    raise exception 'Proposal cannot be decided from its current state' using errcode='P0001';
  end if;

  next_status:=case decision when 'REJECT' then 'REJECTED' else 'NEEDS_CLARIFICATION' end;
  update market.proposals
  set status=next_status,decision_reason=trim(p_reason),updated_at=statement_timestamp()
  where id=proposal.id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,before_state,after_state)
  values(auth.uid(),'ADMIN','MARKET_PROPOSAL_'||decision,'MARKET_PROPOSAL',proposal.public_id::text,trim(p_reason),
         jsonb_build_object('status',proposal.status),jsonb_build_object('status',next_status));
  return true;
end;
$$;

grant execute on function public.admin_role_catalog() to authenticated;
grant execute on function public.admin_role_assignments(text) to authenticated;
grant execute on function public.admin_assign_role(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.admin_revoke_role(bigint,text) to authenticated;
grant execute on function public.admin_market_approval_options() to authenticated;
grant execute on function public.admin_decide_market_proposal(uuid,text,text) to authenticated;
