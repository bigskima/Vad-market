-- VAD Phase 13: provider-neutral payment quoting, KYC gating and payment-intent lifecycle.
-- No external provider is selected here. PostgreSQL owns policy, reservation and idempotency.

do $$
declare p_id bigint; v_id bigint;
begin
  insert into policy.policies(domain,name,description,status)
  values('KYC','payment_access','Minimum verification required for deposits and withdrawals.','ACTIVE')
  on conflict(domain,name) do nothing;
  select id into p_id from policy.policies where domain='KYC' and name='payment_access';
  if not exists(select 1 from policy.policy_versions where policy_id=p_id) then
    insert into policy.policy_versions(policy_id,version,configuration,effective_at,reason)
    values(p_id,1,'{"deposit_min_level":"NONE","withdrawal_min_level":"STANDARD"}'::jsonb,statement_timestamp(),'Bootstrap payment KYC access policy') returning id into v_id;
    update policy.policies set current_version_id=v_id where id=p_id;
  end if;

  insert into policy.policies(domain,name,description,status)
  values('FEES','payment_fees','Provider-neutral deposit and withdrawal fee policy.','ACTIVE')
  on conflict(domain,name) do nothing;
  select id into p_id from policy.policies where domain='FEES' and name='payment_fees';
  if not exists(select 1 from policy.policy_versions where policy_id=p_id) then
    insert into policy.policy_versions(policy_id,version,configuration,effective_at,reason)
    values(p_id,1,'{"deposit_rate_bps":0,"withdrawal_rate_bps":0,"deposit_minimum_fee":0,"withdrawal_minimum_fee":0}'::jsonb,statement_timestamp(),'Zero-fee provider-neutral launch default') returning id into v_id;
    update policy.policies set current_version_id=v_id where id=p_id;
  end if;

  insert into policy.policies(domain,name,description,status)
  values('LIMITS','payment_limits','Provider-neutral deposit and withdrawal amount limits.','ACTIVE')
  on conflict(domain,name) do nothing;
  select id into p_id from policy.policies where domain='LIMITS' and name='payment_limits';
  if not exists(select 1 from policy.policy_versions where policy_id=p_id) then
    insert into policy.policy_versions(policy_id,version,configuration,effective_at,reason)
    values(p_id,1,'{"deposit_min":1,"deposit_max":null,"withdrawal_min":1,"withdrawal_max":null}'::jsonb,statement_timestamp(),'Permissive provider-neutral launch limits') returning id into v_id;
    update policy.policies set current_version_id=v_id where id=p_id;
  end if;
end $$;

create or replace function private.active_policy_configuration(p_domain text,p_name text)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(pv.configuration,'{}'::jsonb)
  from policy.policies p
  join policy.policy_versions pv on pv.id=p.current_version_id
  where p.domain=upper(p_domain) and p.name=p_name and p.status='ACTIVE'
    and pv.effective_at<=statement_timestamp() and (pv.expires_at is null or pv.expires_at>statement_timestamp())
  limit 1;
$$;
revoke all on function private.active_policy_configuration(text,text) from public,anon,authenticated;
grant execute on function private.active_policy_configuration(text,text) to service_role;

create or replace function private.kyc_satisfies(p_user_id uuid,p_required_level text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare required_rank integer; verified_rank integer:=0;
begin
  required_rank:=case upper(coalesce(p_required_level,'NONE')) when 'NONE' then 0 when 'BASIC' then 1 when 'STANDARD' then 2 when 'ENHANCED' then 3 else 99 end;
  if required_rank=0 then return true; end if;
  select coalesce(max(case verification_level when 'BASIC' then 1 when 'STANDARD' then 2 when 'ENHANCED' then 3 else 0 end),0)
    into verified_rank from compliance.kyc_cases where user_id=p_user_id and status='VERIFIED';
  return verified_rank>=required_rank;
end;
$$;
revoke all on function private.kyc_satisfies(uuid,text) from public,anon,authenticated;
grant execute on function private.kyc_satisfies(uuid,text) to service_role;

create or replace function public.payment_quote(p_operation text,p_asset_code text,p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  acct public.user_accounts;
  asset public.assets;
  op text:=upper(trim(coalesce(p_operation,'')));
  provider_id bigint;
  provider_code text;
  access_policy jsonb;
  fee_policy jsonb;
  limit_policy jsonb;
  required_level text;
  min_amount numeric;
  max_amount numeric;
  rate_bps numeric;
  minimum_fee numeric;
  fee numeric;
  cap_key text;
begin
  acct:=private.require_active_account();
  if op not in ('DEPOSIT','WITHDRAWAL') then raise exception 'Unsupported payment operation' using errcode='22023'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Amount must be positive' using errcode='22023'; end if;
  select * into asset from public.assets where code=upper(p_asset_code) and status='ACTIVE' limit 1;
  if asset.id is null then raise exception 'Asset not available' using errcode='P0002'; end if;
  if not exists(select 1 from public.jurisdictions j join public.jurisdiction_assets ja on ja.jurisdiction_id=j.id where j.country_code=acct.country_code and j.status='ACTIVE' and ja.asset_id=asset.id and ja.status='ACTIVE') then
    return jsonb_build_object('enabled',false,'reason','ASSET_NOT_AVAILABLE','operation',op,'assetCode',asset.code,'amount',p_amount);
  end if;

  cap_key:=case op when 'DEPOSIT' then 'deposit' else 'withdraw' end;
  if not private.capability_enabled(cap_key,acct.country_code) then
    return jsonb_build_object('enabled',false,'reason','CAPABILITY_DISABLED','operation',op,'assetCode',asset.code,'amount',p_amount);
  end if;

  access_policy:=coalesce(private.active_policy_configuration('KYC','payment_access'),'{}'::jsonb);
  fee_policy:=coalesce(private.active_policy_configuration('FEES','payment_fees'),'{}'::jsonb);
  limit_policy:=coalesce(private.active_policy_configuration('LIMITS','payment_limits'),'{}'::jsonb);
  required_level:=coalesce(access_policy->>(case op when 'DEPOSIT' then 'deposit_min_level' else 'withdrawal_min_level' end),'NONE');
  if not private.kyc_satisfies(auth.uid(),required_level) then
    return jsonb_build_object('enabled',false,'reason','KYC_REQUIRED','requiredKycLevel',required_level,'operation',op,'assetCode',asset.code,'amount',p_amount);
  end if;

  min_amount:=coalesce((limit_policy->>(case op when 'DEPOSIT' then 'deposit_min' else 'withdrawal_min' end))::numeric,0);
  max_amount:=(limit_policy->>(case op when 'DEPOSIT' then 'deposit_max' else 'withdrawal_max' end))::numeric;
  if p_amount<min_amount then return jsonb_build_object('enabled',false,'reason','BELOW_MINIMUM','minimum',min_amount,'operation',op,'assetCode',asset.code,'amount',p_amount); end if;
  if max_amount is not null and p_amount>max_amount then return jsonb_build_object('enabled',false,'reason','ABOVE_MAXIMUM','maximum',max_amount,'operation',op,'assetCode',asset.code,'amount',p_amount); end if;

  provider_id:=command.select_provider(op,acct.country_code,asset.id,p_amount);
  if provider_id is null then
    return jsonb_build_object('enabled',false,'reason','NO_PAYMENT_PROVIDER','operation',op,'assetCode',asset.code,'amount',p_amount,'requiredKycLevel',required_level);
  end if;
  select code into provider_code from integration.providers where id=provider_id;

  rate_bps:=coalesce((fee_policy->>(case op when 'DEPOSIT' then 'deposit_rate_bps' else 'withdrawal_rate_bps' end))::numeric,0);
  minimum_fee:=coalesce((fee_policy->>(case op when 'DEPOSIT' then 'deposit_minimum_fee' else 'withdrawal_minimum_fee' end))::numeric,0);
  fee:=greatest(round((p_amount*rate_bps/10000)::numeric,18),minimum_fee);
  if fee>p_amount then raise exception 'Fee exceeds amount' using errcode='22023'; end if;

  return jsonb_build_object('enabled',true,'reason',null,'operation',op,'assetCode',asset.code,'amount',p_amount,'feeAmount',fee,'netAmount',p_amount-fee,'providerCode',provider_code,'requiredKycLevel',required_level);
end;
$$;
revoke all on function public.payment_quote(text,text,numeric) from public,anon;
grant execute on function public.payment_quote(text,text,numeric) to authenticated;

create or replace function public.create_payment_intent(p_operation text,p_asset_code text,p_amount numeric,p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  quote jsonb;
  acct public.user_accounts;
  asset public.assets;
  provider bigint;
  intent payments.intents;
  available_account bigint;
  pending_account bigint;
begin
  acct:=private.require_active_account();
  if p_idempotency_key is null or char_length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key is required' using errcode='22023'; end if;
  select * into intent from payments.intents where idempotency_key=trim(p_idempotency_key);
  if intent.id is not null then
    if intent.user_id<>auth.uid() then raise exception 'Idempotency key conflict' using errcode='23505'; end if;
    return intent.public_id;
  end if;

  quote:=public.payment_quote(p_operation,p_asset_code,p_amount);
  if not coalesce((quote->>'enabled')::boolean,false) then raise exception 'Payment unavailable: %',coalesce(quote->>'reason','UNKNOWN') using errcode='P0001'; end if;
  select * into asset from public.assets where code=upper(p_asset_code) and status='ACTIVE' limit 1;
  select id into provider from integration.providers where code=quote->>'providerCode' and status in ('ACTIVE','DEGRADED') order by priority,id limit 1;
  if provider is null then raise exception 'Payment provider no longer available' using errcode='P0001'; end if;

  insert into payments.intents(user_id,asset_id,operation,amount,fee_amount,provider_id,status,idempotency_key)
  values(auth.uid(),asset.id,upper(p_operation),p_amount,(quote->>'feeAmount')::numeric,provider,'CREATED',trim(p_idempotency_key))
  returning * into intent;

  if upper(p_operation)='WITHDRAWAL' then
    available_account:=finance.ensure_user_account(auth.uid(),asset.id,'USER_AVAILABLE');
    pending_account:=finance.ensure_user_account(auth.uid(),asset.id,'WITHDRAWAL_PENDING');
    perform finance.transfer(asset.id,available_account,pending_account,p_amount,'WITHDRAWAL_RESERVE','withdrawal-reserve:'||intent.public_id::text,'PAYMENT_INTENT',intent.public_id::text,'Reserve funds for withdrawal',auth.uid());
  end if;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('PAYMENT_INTENT_CREATED','PAYMENT_INTENT',intent.public_id::text,jsonb_build_object('operation',intent.operation,'asset',asset.code,'amount',intent.amount,'provider_code',quote->>'providerCode'),'payment-intent-created:'||intent.public_id::text)
  on conflict(idempotency_key) do nothing;
  return intent.public_id;
end;
$$;
revoke all on function public.create_payment_intent(text,text,numeric,text) from public,anon;
grant execute on function public.create_payment_intent(text,text,numeric,text) to authenticated;

create or replace function public.cancel_payment_intent(p_intent_public_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  intent payments.intents;
  available_account bigint;
  pending_account bigint;
begin
  perform private.require_active_account();
  select * into intent from payments.intents where public_id=p_intent_public_id and user_id=auth.uid() for update;
  if intent.id is null then raise exception 'Payment intent not found' using errcode='P0002'; end if;
  if intent.status<>'CREATED' then raise exception 'Only unsubmitted payment intents can be cancelled' using errcode='P0001'; end if;

  if intent.operation='WITHDRAWAL' then
    available_account:=finance.ensure_user_account(auth.uid(),intent.asset_id,'USER_AVAILABLE');
    pending_account:=finance.ensure_user_account(auth.uid(),intent.asset_id,'WITHDRAWAL_PENDING');
    perform finance.transfer(intent.asset_id,pending_account,available_account,intent.amount,'WITHDRAWAL_RELEASE','withdrawal-release:'||intent.public_id::text,'PAYMENT_INTENT',intent.public_id::text,'Release cancelled withdrawal reserve',auth.uid());
  end if;
  update payments.intents set status='CANCELLED' where id=intent.id;
end;
$$;
revoke all on function public.cancel_payment_intent(uuid) from public,anon;
grant execute on function public.cancel_payment_intent(uuid) to authenticated;

create or replace function public.admin_provider_readiness()
returns table(provider_code text,provider_type text,environment text,provider_status text,configured boolean,operation text,country_code text,asset_code text,route_status text,priority integer)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.has_permission('providers.manage') and not private.has_permission('system.view') then raise exception 'Permission required' using errcode='42501'; end if;
  return query
  select p.code,p.provider_type,p.environment,p.status,coalesce((p.public_metadata->>'configured')::boolean,false),r.operation,r.country_code,a.code,r.status,r.priority
  from integration.providers p
  left join integration.provider_routes r on r.provider_id=p.id
  left join public.assets a on a.id=r.asset_id
  order by p.provider_type,p.priority,p.code,r.operation,r.country_code;
end;
$$;
revoke all on function public.admin_provider_readiness() from public,anon;
grant execute on function public.admin_provider_readiness() to authenticated;
