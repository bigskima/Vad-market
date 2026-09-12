-- Launch policy control plane + isolated sandbox oracle policy.

create or replace function public.admin_launch_policy_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  result jsonb;
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
      select jsonb_build_object(
        'status',p.status,
        'version',pv.version,
        'configuration',pv.configuration,
        'effectiveAt',pv.effective_at
      )
      from policy.policies p
      left join policy.policy_versions pv on pv.id=p.current_version_id
      where p.domain='PLATFORM' and p.name='launch_phase'
      limit 1
    ),
    'marketAdmission',(
      select jsonb_build_object(
        'status',p.status,
        'version',pv.version,
        'configuration',pv.configuration,
        'effectiveAt',pv.effective_at
      )
      from policy.policies p
      left join policy.policy_versions pv on pv.id=p.current_version_id
      where p.domain='MARKETS' and p.name='market_admission'
      limit 1
    ),
    'settlementFee',(
      select jsonb_build_object(
        'status',p.status,
        'version',pv.version,
        'configuration',pv.configuration,
        'effectiveAt',pv.effective_at
      )
      from policy.policies p
      left join policy.policy_versions pv on pv.id=p.current_version_id
      where p.domain='FEES' and p.name='settlement_fee'
      limit 1
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
  clean_reason text:=trim(coalesce(p_reason,''));
  target_domain text;
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
  if target_domain is null then
    raise exception 'Unsupported launch policy' using errcode='22023';
  end if;

  if p_policy_name='launch_phase' then
    if coalesce(cfg->>'country_code','') !~ '^[A-Z]{2}$' then
      raise exception 'Launch country code is invalid' using errcode='22023';
    end if;
    if coalesce(cfg->>'settlement_asset','') !~ '^[A-Z0-9]{2,12}$' then
      raise exception 'Settlement asset is invalid' using errcode='22023';
    end if;
    if coalesce((cfg->>'phase')::integer,0)<1 then
      raise exception 'Launch phase must be at least 1' using errcode='22023';
    end if;
  elsif p_policy_name='market_admission' then
    if jsonb_typeof(coalesce(cfg->'allowed_template_codes','[]'::jsonb))<>'array' then
      raise exception 'Allowed template codes must be an array' using errcode='22023';
    end if;
    if coalesce((cfg->>'minimum_order_notional')::numeric,0)<0 then
      raise exception 'Minimum order notional cannot be negative' using errcode='22023';
    end if;
  end if;

  select * into pol from policy.policies where domain=target_domain and name=p_policy_name for update;
  if pol.id is null then
    raise exception 'Launch policy is not configured' using errcode='P0002';
  end if;

  select coalesce(max(version),0)+1 into next_version
  from policy.policy_versions where policy_id=pol.id;

  insert into policy.policy_versions(
    policy_id,version,configuration,effective_at,created_by,approved_by,reason,activation_mode
  ) values (
    pol.id,next_version,cfg,statement_timestamp(),auth.uid(),auth.uid(),clean_reason,'SUPER_ADMIN_DIRECT'
  ) returning id into version_id;

  update policy.policies
  set current_version_id=version_id,status='ACTIVE',updated_at=statement_timestamp()
  where id=pol.id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,after_state,reason,metadata)
  values(
    auth.uid(),'USER','LAUNCH_POLICY_SUPER_ADMIN_DIRECT','POLICY_VERSION',version_id::text,
    jsonb_build_object('domain',target_domain,'name',p_policy_name,'version',next_version,'configuration',cfg),
    clean_reason,
    jsonb_build_object('governance','SUPER_ADMIN_DIRECT')
  );

  return version_id;
end;
$$;

revoke all on function public.admin_set_launch_policy_immediate(text,jsonb,text) from public,anon;
grant execute on function public.admin_set_launch_policy_immediate(text,jsonb,text) to authenticated;

-- Ensure a settlement fee policy exists for launch testing. Starts at 0% and can
-- be changed from the existing Fee Controls screen by Super Admin.
do $$
declare pol_id bigint; ver_id bigint;
begin
  select id into pol_id from policy.policies where domain='FEES' and name='settlement_fee';
  if pol_id is null then
    insert into policy.policies(domain,name,description,status)
    values('FEES','settlement_fee','Settlement fee charged on eligible market settlement proceeds.','ACTIVE')
    returning id into pol_id;

    insert into policy.policy_versions(policy_id,version,configuration,effective_at,reason,activation_mode)
    values(pol_id,1,jsonb_build_object('rate_bps',0,'minimum_fee',0,'maximum_fee',null),statement_timestamp(),'Initial settlement policy for launch readiness','MIGRATION')
    returning id into ver_id;

    update policy.policies set current_version_id=ver_id where id=pol_id;
  end if;
end $$;

-- Create a sandbox-only oracle policy. The environment marker is intentionally
-- stored in consensus_rule so the existing schema remains backward compatible.
do $$
declare cap_id bigint;
begin
  select id into cap_id from oracle.capabilities where code='OBJECTIVE_EVENT_RESULT';
  if cap_id is not null and not exists(
    select 1 from oracle.policies where name='VAD Sandbox Crypto Threshold Policy'
  ) then
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
      'ACTIVE',statement_timestamp(),null,null
    );
  end if;
end $$;

-- Sandbox oracle policies must never be offered by the normal production
-- market-approval flow.
create or replace function public.admin_market_approval_options()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if not private.has_permission('markets.manage') then raise exception 'Permission required' using errcode='42501'; end if;
  select jsonb_build_object(
    'templates',coalesce((select jsonb_agg(jsonb_build_object('code',t.code,'name',t.name) order by t.code) from market.templates t where t.status='ACTIVE'),'[]'::jsonb),
    'oraclePolicies',coalesce((select jsonb_agg(jsonb_build_object('publicId',p.public_id,'name',p.name,'version',p.version) order by p.name,p.version desc) from oracle.policies p where p.status='ACTIVE' and p.effective_at<=statement_timestamp() and coalesce(p.consensus_rule->>'environment','PRODUCTION')='PRODUCTION'),'[]'::jsonb),
    'jurisdictions',coalesce((select jsonb_agg(jsonb_build_object('countryCode',j.country_code,'name',j.name,'assets',coalesce((select jsonb_agg(a.code order by a.code) from public.jurisdiction_assets ja join public.assets a on a.id=ja.asset_id where ja.jurisdiction_id=j.id and ja.status='ACTIVE' and a.status='ACTIVE'),'[]'::jsonb)) order by j.country_code) from public.jurisdictions j where j.status='ACTIVE'),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_market_approval_options() from public,anon;
grant execute on function public.admin_market_approval_options() to authenticated;
