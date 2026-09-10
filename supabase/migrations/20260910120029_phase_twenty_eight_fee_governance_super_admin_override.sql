alter table policy.policy_versions
  add column if not exists activation_mode text not null default 'LEGACY';

alter table policy.policy_versions drop constraint if exists policy_versions_activation_mode_check;
alter table policy.policy_versions drop constraint if exists policy_versions_dual_control;

alter table policy.policy_versions
  add constraint policy_versions_activation_mode_check
    check (activation_mode in ('LEGACY','DUAL_CONTROL','SUPER_ADMIN_DIRECT')),
  add constraint policy_versions_dual_control
    check (
      ((created_by is null) and (approved_by is null))
      or ((created_by is not null) and (approved_by is null))
      or (
        (created_by is not null)
        and (approved_by is not null)
        and ((created_by <> approved_by) or activation_mode = 'SUPER_ADMIN_DIRECT')
      )
    );

create table if not exists policy.fee_change_requests (
  id bigserial primary key,
  public_id uuid not null default gen_random_uuid() unique,
  policy_name text not null check (policy_name in ('trading_fee','settlement_fee','payment_fees')),
  configuration jsonb not null check (jsonb_typeof(configuration)='object'),
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  proposed_by uuid not null references auth.users(id) on delete restrict,
  proposed_at timestamptz not null default statement_timestamp(),
  current_version_id_at_proposal bigint references policy.policy_versions(id),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text check (review_reason is null or char_length(review_reason) between 3 and 1000),
  activated_policy_version_id bigint references policy.policy_versions(id),
  constraint fee_change_requests_review_state check (
    (status='PENDING' and reviewed_by is null and reviewed_at is null and activated_policy_version_id is null)
    or (status='REJECTED' and reviewed_by is not null and reviewed_at is not null and activated_policy_version_id is null)
    or (status='APPROVED' and reviewed_by is not null and reviewed_at is not null and activated_policy_version_id is not null)
  )
);

create index if not exists fee_change_requests_status_time_idx
  on policy.fee_change_requests(status, proposed_at desc);
create index if not exists fee_change_requests_proposer_idx
  on policy.fee_change_requests(proposed_by, proposed_at desc);

alter table policy.fee_change_requests enable row level security;
revoke all on table policy.fee_change_requests from anon, authenticated;

insert into admin.permissions(code, description)
values ('fees.propose', 'Propose VAD fee policy changes for Super Admin review.')
on conflict (code) do update set description=excluded.description;

insert into admin.role_permissions(role_id, permission_id)
select r.id,p.id
from admin.roles r
join admin.permissions p on p.code='fees.propose'
where r.code in ('FINANCE_ADMIN','SUPER_ADMIN')
on conflict do nothing;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from admin.user_roles ur
    join admin.roles r on r.id=ur.role_id
    where ur.user_id=auth.uid()
      and r.code='SUPER_ADMIN'
      and ur.effective_at <= statement_timestamp()
      and (ur.expires_at is null or ur.expires_at > statement_timestamp())
      and ur.revoked_at is null
  );
$$;

create or replace function private.validate_fee_policy_configuration(
  p_policy_name text,
  p_configuration jsonb
)
returns jsonb
language plpgsql
immutable
security definer
set search_path=''
as $$
declare
  cfg jsonb:=coalesce(p_configuration,'{}'::jsonb);
  maker_bps numeric;
  taker_bps numeric;
  rate_bps numeric;
  deposit_bps numeric;
  withdrawal_bps numeric;
  minimum_fee numeric;
  maximum_fee numeric;
  deposit_minimum numeric;
  withdrawal_minimum numeric;
begin
  if jsonb_typeof(cfg)<>'object' then
    raise exception 'Fee configuration must be an object' using errcode='22023';
  end if;

  if p_policy_name='trading_fee' then
    maker_bps:=coalesce(nullif(cfg->>'maker_rate_bps','')::numeric,0);
    taker_bps:=coalesce(nullif(cfg->>'taker_rate_bps','')::numeric,0);
    minimum_fee:=coalesce(nullif(cfg->>'minimum_fee','')::numeric,0);
    maximum_fee:=nullif(cfg->>'maximum_fee','')::numeric;
    if maker_bps<0 or maker_bps>10000 or taker_bps<0 or taker_bps>10000 then
      raise exception 'Trading fee rates must be between 0 and 100 percent' using errcode='22023';
    end if;
    if minimum_fee<0 or (maximum_fee is not null and maximum_fee<minimum_fee) then
      raise exception 'Trading fee minimum/maximum is invalid' using errcode='22023';
    end if;
    return jsonb_build_object('maker_rate_bps',maker_bps,'taker_rate_bps',taker_bps,'minimum_fee',minimum_fee,'maximum_fee',maximum_fee);
  elsif p_policy_name='settlement_fee' then
    rate_bps:=coalesce(nullif(cfg->>'rate_bps','')::numeric,0);
    minimum_fee:=coalesce(nullif(cfg->>'minimum_fee','')::numeric,0);
    maximum_fee:=nullif(cfg->>'maximum_fee','')::numeric;
    if rate_bps<0 or rate_bps>10000 then
      raise exception 'Settlement fee rate must be between 0 and 100 percent' using errcode='22023';
    end if;
    if minimum_fee<0 or (maximum_fee is not null and maximum_fee<minimum_fee) then
      raise exception 'Settlement fee minimum/maximum is invalid' using errcode='22023';
    end if;
    return jsonb_build_object('rate_bps',rate_bps,'minimum_fee',minimum_fee,'maximum_fee',maximum_fee);
  elsif p_policy_name='payment_fees' then
    deposit_bps:=coalesce(nullif(cfg->>'deposit_rate_bps','')::numeric,0);
    withdrawal_bps:=coalesce(nullif(cfg->>'withdrawal_rate_bps','')::numeric,0);
    deposit_minimum:=coalesce(nullif(cfg->>'deposit_minimum_fee','')::numeric,0);
    withdrawal_minimum:=coalesce(nullif(cfg->>'withdrawal_minimum_fee','')::numeric,0);
    if deposit_bps<0 or deposit_bps>10000 or withdrawal_bps<0 or withdrawal_bps>10000 then
      raise exception 'Payment fee rates must be between 0 and 100 percent' using errcode='22023';
    end if;
    if deposit_minimum<0 or withdrawal_minimum<0 then
      raise exception 'Payment minimum fees cannot be negative' using errcode='22023';
    end if;
    return jsonb_build_object('deposit_rate_bps',deposit_bps,'deposit_minimum_fee',deposit_minimum,'withdrawal_rate_bps',withdrawal_bps,'withdrawal_minimum_fee',withdrawal_minimum);
  end if;

  raise exception 'Unsupported fee policy: %',p_policy_name using errcode='22023';
end;
$$;

create or replace function private.ensure_fee_policy(p_policy_name text, p_created_by uuid)
returns policy.policies
language plpgsql
security definer
set search_path=''
as $$
declare
  pol policy.policies;
  description_value text;
begin
  if p_policy_name not in ('trading_fee','settlement_fee','payment_fees') then
    raise exception 'Unsupported fee policy: %',p_policy_name using errcode='22023';
  end if;
  description_value:=case p_policy_name
    when 'trading_fee' then 'Maker/taker execution fee policy for VAD markets'
    when 'settlement_fee' then 'Fee policy applied to eligible market settlement proceeds'
    when 'payment_fees' then 'Provider-neutral deposit and withdrawal fee policy.'
  end;
  select * into pol from policy.policies where domain='FEES' and name=p_policy_name for update;
  if pol.id is null then
    insert into policy.policies(domain,name,description,status,created_by)
    values('FEES',p_policy_name,description_value,'DRAFT',p_created_by)
    on conflict(domain,name) do nothing;
    select * into pol from policy.policies where domain='FEES' and name=p_policy_name for update;
  end if;
  return pol;
end;
$$;

create or replace function public.admin_propose_fee_policy(
  p_policy_name text,
  p_configuration jsonb,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  pol policy.policies;
  cfg jsonb;
  clean_reason text:=trim(coalesce(p_reason,''));
  request_public_id uuid;
begin
  if not private.has_permission('fees.propose') then
    raise exception 'Permission required' using errcode='42501';
  end if;
  if char_length(clean_reason)<3 or char_length(clean_reason)>1000 then
    raise exception 'A reason between 3 and 1000 characters is required' using errcode='22023';
  end if;
  cfg:=private.validate_fee_policy_configuration(p_policy_name,p_configuration);
  pol:=private.ensure_fee_policy(p_policy_name,auth.uid());

  insert into policy.fee_change_requests(
    policy_name,configuration,reason,proposed_by,current_version_id_at_proposal
  ) values (
    p_policy_name,cfg,clean_reason,auth.uid(),pol.current_version_id
  ) returning public_id into request_public_id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,after_state,reason,metadata)
  values(
    auth.uid(),'USER','FEE_POLICY_PROPOSED','FEE_CHANGE_REQUEST',request_public_id::text,
    jsonb_build_object('policy_name',p_policy_name,'configuration',cfg,'status','PENDING'),
    clean_reason,
    jsonb_build_object('governance','DUAL_CONTROL','requires_super_admin_approval',true,'current_version_id',pol.current_version_id)
  );
  return request_public_id;
end;
$$;

create or replace function public.admin_set_fee_policy_immediate(
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
  current_pv policy.policy_versions;
  cfg jsonb;
  clean_reason text:=trim(coalesce(p_reason,''));
  next_version integer;
  version_id bigint;
begin
  if not private.is_super_admin() then
    raise exception 'Super Admin required' using errcode='42501';
  end if;
  if char_length(clean_reason)<3 or char_length(clean_reason)>1000 then
    raise exception 'A reason between 3 and 1000 characters is required' using errcode='22023';
  end if;
  cfg:=private.validate_fee_policy_configuration(p_policy_name,p_configuration);
  pol:=private.ensure_fee_policy(p_policy_name,auth.uid());
  if pol.current_version_id is not null then
    select * into current_pv from policy.policy_versions where id=pol.current_version_id;
  end if;
  select coalesce(max(version),0)+1 into next_version from policy.policy_versions where policy_id=pol.id;

  insert into policy.policy_versions(
    policy_id,version,configuration,effective_at,created_by,approved_by,reason,activation_mode
  ) values (
    pol.id,next_version,cfg,statement_timestamp(),auth.uid(),auth.uid(),clean_reason,'SUPER_ADMIN_DIRECT'
  ) returning id into version_id;

  update policy.policies set current_version_id=version_id,status='ACTIVE',updated_at=statement_timestamp() where id=pol.id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,before_state,after_state,reason,metadata)
  values(
    auth.uid(),'USER','FEE_POLICY_SUPER_ADMIN_DIRECT','POLICY_VERSION',version_id::text,
    case when current_pv.id is null then null else jsonb_build_object('policy_version_id',current_pv.id,'version',current_pv.version,'configuration',current_pv.configuration) end,
    jsonb_build_object('policy_name',p_policy_name,'policy_version_id',version_id,'version',next_version,'configuration',cfg,'status','ACTIVE'),
    clean_reason,
    jsonb_build_object('governance','SUPER_ADMIN_DIRECT','approval_workflow_bypassed',true,'validation_bypassed',false)
  );
  return version_id;
end;
$$;

create or replace function public.admin_decide_fee_policy_proposal(
  p_request_public_id uuid,
  p_decision text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  req policy.fee_change_requests;
  pol policy.policies;
  current_pv policy.policy_versions;
  cfg jsonb;
  clean_reason text:=trim(coalesce(p_reason,''));
  decision_value text:=upper(trim(coalesce(p_decision,'')));
  next_version integer;
  version_id bigint;
begin
  if not private.is_super_admin() then
    raise exception 'Super Admin required' using errcode='42501';
  end if;
  if decision_value not in ('APPROVE','REJECT') then
    raise exception 'Decision must be APPROVE or REJECT' using errcode='22023';
  end if;
  if char_length(clean_reason)<3 or char_length(clean_reason)>1000 then
    raise exception 'A review reason between 3 and 1000 characters is required' using errcode='22023';
  end if;

  select * into req from policy.fee_change_requests where public_id=p_request_public_id for update;
  if req.id is null or req.status<>'PENDING' then
    raise exception 'Pending fee proposal required' using errcode='P0001';
  end if;

  if decision_value='REJECT' then
    update policy.fee_change_requests
    set status='REJECTED',reviewed_by=auth.uid(),reviewed_at=statement_timestamp(),review_reason=clean_reason
    where id=req.id;
    insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,after_state,reason,metadata)
    values(auth.uid(),'USER','FEE_POLICY_PROPOSAL_REJECTED','FEE_CHANGE_REQUEST',req.public_id::text,
      jsonb_build_object('policy_name',req.policy_name,'configuration',req.configuration,'status','REJECTED'),clean_reason,
      jsonb_build_object('governance','DUAL_CONTROL','proposed_by',req.proposed_by));
    return true;
  end if;

  if req.proposed_by=auth.uid() then
    raise exception 'Use the Super Admin immediate update path for your own fee change' using errcode='42501';
  end if;

  cfg:=private.validate_fee_policy_configuration(req.policy_name,req.configuration);
  pol:=private.ensure_fee_policy(req.policy_name,req.proposed_by);
  if pol.current_version_id is distinct from req.current_version_id_at_proposal then
    raise exception 'Fee policy changed after this proposal was submitted. Reject it and submit a fresh proposal.' using errcode='40001';
  end if;
  if pol.current_version_id is not null then
    select * into current_pv from policy.policy_versions where id=pol.current_version_id;
  end if;
  select coalesce(max(version),0)+1 into next_version from policy.policy_versions where policy_id=pol.id;

  insert into policy.policy_versions(
    policy_id,version,configuration,effective_at,created_by,approved_by,reason,activation_mode
  ) values (
    pol.id,next_version,cfg,statement_timestamp(),req.proposed_by,auth.uid(),req.reason,'DUAL_CONTROL'
  ) returning id into version_id;

  update policy.policies set current_version_id=version_id,status='ACTIVE',updated_at=statement_timestamp() where id=pol.id;
  update policy.fee_change_requests
  set status='APPROVED',reviewed_by=auth.uid(),reviewed_at=statement_timestamp(),review_reason=clean_reason,activated_policy_version_id=version_id
  where id=req.id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,before_state,after_state,reason,metadata)
  values(
    auth.uid(),'USER','FEE_POLICY_PROPOSAL_APPROVED','FEE_CHANGE_REQUEST',req.public_id::text,
    case when current_pv.id is null then null else jsonb_build_object('policy_version_id',current_pv.id,'version',current_pv.version,'configuration',current_pv.configuration) end,
    jsonb_build_object('policy_name',req.policy_name,'policy_version_id',version_id,'version',next_version,'configuration',cfg,'status','ACTIVE'),
    clean_reason,
    jsonb_build_object('governance','DUAL_CONTROL','proposed_by',req.proposed_by,'proposal_reason',req.reason)
  );
  return true;
end;
$$;

create or replace function public.admin_fee_policy_queue()
returns table(
  request_public_id uuid,
  policy_name text,
  configuration jsonb,
  proposal_reason text,
  proposed_by uuid,
  proposer_email text,
  proposed_at timestamptz,
  current_version_id_at_proposal bigint,
  current_configuration jsonb
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_super_admin() and not private.has_permission('fees.propose') then
    raise exception 'Permission required' using errcode='42501';
  end if;
  return query
  select
    r.public_id,r.policy_name,r.configuration,r.reason,r.proposed_by,u.email::text,r.proposed_at,
    r.current_version_id_at_proposal,current_pv.configuration
  from policy.fee_change_requests r
  left join auth.users u on u.id=r.proposed_by
  left join policy.policies p on p.domain='FEES' and p.name=r.policy_name
  left join policy.policy_versions current_pv on current_pv.id=p.current_version_id
  where r.status='PENDING'
    and (private.is_super_admin() or r.proposed_by=auth.uid())
  order by r.proposed_at desc,r.id desc;
end;
$$;

create or replace function public.admin_create_trading_fee_policy_draft(
  p_maker_rate_bps numeric,
  p_taker_rate_bps numeric,
  p_minimum_fee numeric default 0,
  p_maximum_fee numeric default null,
  p_reason text default 'Trading fee policy update'
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  request_id uuid;
  internal_id bigint;
begin
  request_id:=public.admin_propose_fee_policy(
    'trading_fee',
    jsonb_build_object('maker_rate_bps',p_maker_rate_bps,'taker_rate_bps',p_taker_rate_bps,'minimum_fee',greatest(coalesce(p_minimum_fee,0),0),'maximum_fee',p_maximum_fee),
    p_reason
  );
  select id into internal_id from policy.fee_change_requests where public_id=request_id;
  return internal_id;
end;
$$;

create or replace function public.admin_approve_trading_fee_policy(
  p_policy_version_id bigint,
  p_effective_at timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  request_id uuid;
begin
  if p_effective_at > statement_timestamp()+interval '5 minutes' then
    raise exception 'Scheduled legacy approval is not supported; use current fee controls' using errcode='22023';
  end if;
  select public_id into request_id from policy.fee_change_requests where id=p_policy_version_id;
  if request_id is null then
    raise exception 'Fee proposal not found' using errcode='P0002';
  end if;
  return public.admin_decide_fee_policy_proposal(request_id,'APPROVE','Approved by Super Admin through legacy trading fee approval entry point');
end;
$$;

revoke all on function public.admin_propose_fee_policy(text,jsonb,text) from public,anon;
revoke all on function public.admin_set_fee_policy_immediate(text,jsonb,text) from public,anon;
revoke all on function public.admin_decide_fee_policy_proposal(uuid,text,text) from public,anon;
revoke all on function public.admin_fee_policy_queue() from public,anon;
revoke all on function public.admin_create_trading_fee_policy_draft(numeric,numeric,numeric,numeric,text) from public,anon;
revoke all on function public.admin_approve_trading_fee_policy(bigint,timestamptz) from public,anon;

grant execute on function public.admin_propose_fee_policy(text,jsonb,text) to authenticated,service_role;
grant execute on function public.admin_set_fee_policy_immediate(text,jsonb,text) to authenticated,service_role;
grant execute on function public.admin_decide_fee_policy_proposal(uuid,text,text) to authenticated,service_role;
grant execute on function public.admin_fee_policy_queue() to authenticated,service_role;
grant execute on function public.admin_create_trading_fee_policy_draft(numeric,numeric,numeric,numeric,text) to authenticated,service_role;
grant execute on function public.admin_approve_trading_fee_policy(bigint,timestamptz) to authenticated,service_role;