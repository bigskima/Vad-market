-- Admin launch-readiness workspace. Runtime changes remain versioned and audited.

create or replace function public.admin_launch_policy_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if auth.uid() is null or not (
    private.has_permission('policies.manage')
    or private.has_permission('markets.manage')
    or private.has_permission('oracle.review')
    or private.has_permission('finance.read')
  ) then
    raise exception 'Permission required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'launchPhase',(
      select jsonb_build_object('status',p.status,'version',pv.version,'configuration',pv.configuration,'effectiveAt',pv.effective_at)
      from policy.policies p left join policy.policy_versions pv on pv.id=p.current_version_id
      where p.domain='PLATFORM' and p.name='launch_phase' limit 1
    ),
    'marketAdmission',(
      select jsonb_build_object('status',p.status,'version',pv.version,'configuration',pv.configuration,'effectiveAt',pv.effective_at)
      from policy.policies p left join policy.policy_versions pv on pv.id=p.current_version_id
      where p.domain='MARKETS' and p.name='market_admission' limit 1
    ),
    'settlementFee',(
      select jsonb_build_object('status',p.status,'version',pv.version,'configuration',pv.configuration,'effectiveAt',pv.effective_at)
      from policy.policies p left join policy.policy_versions pv on pv.id=p.current_version_id
      where p.domain='FEES' and p.name='settlement_fee' limit 1
    ),
    'oraclePolicies',coalesce((
      select jsonb_agg(jsonb_build_object(
        'publicId',op.public_id,
        'name',op.name,
        'version',op.version,
        'status',op.status,
        'environment',coalesce(op.consensus_rule->>'environment','PRODUCTION'),
        'disputeWindowSeconds',op.dispute_window_seconds,
        'effectiveAt',op.effective_at,
        'createdBy',op.created_by,
        'approvedBy',op.approved_by
      ) order by coalesce(op.consensus_rule->>'environment','PRODUCTION'),op.name,op.version desc)
      from oracle.policies op
    ),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_launch_policy_workspace() from public,anon;
grant execute on function public.admin_launch_policy_workspace() to authenticated;

create or replace function public.admin_set_launch_policy_immediate(
  p_policy_name text,
  p_configuration jsonb,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  pol policy.policies;
  next_version integer;
  version_id bigint;
  target_domain text;
  clean_reason text:=trim(coalesce(p_reason,''));
  cfg jsonb:=coalesce(p_configuration,'{}'::jsonb);
begin
  if not private.is_super_admin() then
    raise exception 'Super Admin required' using errcode='42501';
  end if;
  if char_length(clean_reason)<3 or char_length(clean_reason)>1000 then
    raise exception 'A reason between 3 and 1000 characters is required' using errcode='22023';
  end if;

  target_domain:=case p_policy_name
    when 'launch_phase' then 'PLATFORM'
    when 'market_admission' then 'MARKETS'
    else null
  end;
  if target_domain is null then raise exception 'Unsupported launch policy' using errcode='22023'; end if;

  select * into pol from policy.policies where domain=target_domain and name=p_policy_name for update;
  if pol.id is null then raise exception 'Launch policy is not configured' using errcode='P0002'; end if;

  select coalesce(max(version),0)+1 into next_version from policy.policy_versions where policy_id=pol.id;
  insert into policy.policy_versions(policy_id,version,configuration,effective_at,created_by,approved_by,reason,activation_mode)
  values(pol.id,next_version,cfg,statement_timestamp(),auth.uid(),auth.uid(),clean_reason,'SUPER_ADMIN_DIRECT')
  returning id into version_id;

  update policy.policies set current_version_id=version_id,status='ACTIVE',updated_at=statement_timestamp() where id=pol.id;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,after_state,reason,metadata)
  values(auth.uid(),'USER','LAUNCH_POLICY_SUPER_ADMIN_DIRECT','POLICY_VERSION',version_id::text,
    jsonb_build_object('domain',target_domain,'name',p_policy_name,'version',next_version,'configuration',cfg),
    clean_reason,jsonb_build_object('governance','SUPER_ADMIN_DIRECT'));

  return version_id;
end;
$$;

revoke all on function public.admin_set_launch_policy_immediate(text,jsonb,text) from public,anon;
grant execute on function public.admin_set_launch_policy_immediate(text,jsonb,text) to authenticated;

-- Sandbox oracle policy is created as a draft. It is intentionally not exposed
-- to production market approval unless explicitly approved and bound by test tooling.
do $$
declare cap_id bigint;
begin
  select id into cap_id from oracle.capabilities where code='OBJECTIVE_EVENT_RESULT';
  if cap_id is not null and not exists(select 1 from oracle.policies where name='VAD Sandbox Crypto Threshold Policy') then
    insert into oracle.policies(
      name,capability_id,version,source_hierarchy,consensus_rule,close_rule,
      postponement_rule,cancellation_rule,void_rule,dispute_window_seconds,
      status,effective_at,created_by,approved_by
    ) values(
      'VAD Sandbox Crypto Threshold Policy',cap_id,1,
      '[{"role":"PRIMARY","provider_code":"PYTH"},{"role":"CORROBORATING","provider_code":"COINGECKO"}]'::jsonb,
      '{"environment":"SANDBOX","tie_behavior":"NO_RESOLUTION","finalization_mode":"AUTO_AFTER_DISPUTE_WINDOW","distinct_providers":true,"min_agreeing_providers":2}'::jsonb,
      '{"mode":"SCHEDULED_CLOSE"}'::jsonb,
      '{"mode":"REVIEW"}'::jsonb,
      '{"mode":"VOID"}'::jsonb,
      '{"mode":"EQUAL_SPLIT"}'::jsonb,
      60,
      'DRAFT',statement_timestamp(),null,null
    );
  end if;
end $$;
