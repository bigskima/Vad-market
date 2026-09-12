-- Automatic admin market resolution + isolated Test NGN sandbox currency.

create or replace function private.derive_market_resolution_scope(
  p_proposal market.proposals,
  p_title text,
  p_category text,
  p_resolves_after timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_scope jsonb;
  v_category text:=upper(btrim(coalesce(p_category,'')));
  v_resolver text;
begin
  v_scope:=p_proposal.normalized_payload->'ai_admission'->'resolutionScope';
  if jsonb_typeof(v_scope) <> 'object' or v_scope='{}'::jsonb then
    v_scope:=jsonb_build_object(
      'resolver_type','VAD_REVIEW_V1',
      'condition',format('Resolve YES when authoritative evidence confirms the market proposition: %s',btrim(p_title)),
      'verification','VAD oracle review using approved authoritative evidence sources.',
      'category',v_category,
      'market_question',btrim(p_title),
      'resolution_time',p_resolves_after
    );
  else
    v_resolver:=upper(coalesce(v_scope->>'resolver_type',v_scope->>'resolverType',''));
    if v_resolver not in ('CRYPTO_PRICE_THRESHOLD_V1','FOOTBALL_MATCH_RESULT_V1') then
      v_scope:=v_scope || jsonb_build_object('resolver_type','VAD_REVIEW_V1','resolution_time',p_resolves_after,'category',v_category);
    else
      v_scope:=v_scope || jsonb_build_object('resolution_time',p_resolves_after,'category',v_category);
    end if;
  end if;
  return v_scope;
end;
$$;
revoke all on function private.derive_market_resolution_scope(market.proposals,text,text,timestamptz) from public,anon,authenticated;

create or replace function public.admin_approve_market_proposal(
  p_proposal_public_id uuid,
  p_template_code text,
  p_title text,
  p_description text,
  p_category text,
  p_normalized_parameters jsonb,
  p_resolution_scope jsonb,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_oracle_policy_public_id uuid,
  p_country_code text,
  p_asset_code text,
  p_min_order_notional numeric default 100,
  p_pricing_precision smallint default 4
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  proposal market.proposals;
  template market.templates;
  oracle_policy oracle.policies;
  jurisdiction public.jurisdictions;
  asset public.assets;
  fingerprint text;
  event_id bigint;
  event_public_id uuid;
  instrument_id bigint;
  instrument_public_id uuid;
  existing boolean:=false;
  instrument_status text;
  v_resolution_scope jsonb;
  v_resolution_mode text;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501'; end if;
  select * into proposal from market.proposals where public_id=p_proposal_public_id for update;
  if proposal.id is null then raise exception 'Market proposal not found' using errcode='P0002'; end if;
  if proposal.status not in ('SUBMITTED','PROCESSING','UNDER_REVIEW','NEEDS_CLARIFICATION') then raise exception 'Proposal cannot be approved from its current state' using errcode='P0001'; end if;
  select * into template from market.templates where code=p_template_code and status='ACTIVE';
  if template.id is null then raise exception 'Active market template not found' using errcode='22023'; end if;
  select * into oracle_policy from oracle.policies where public_id=p_oracle_policy_public_id and status='ACTIVE' and effective_at<=statement_timestamp();
  if oracle_policy.id is null then raise exception 'An active oracle policy is required before market approval' using errcode='P0001'; end if;
  select * into jurisdiction from public.jurisdictions where country_code=upper(p_country_code) and status='ACTIVE';
  if jurisdiction.id is null then raise exception 'Jurisdiction is not active' using errcode='P0001'; end if;
  select a.* into asset from public.assets a join public.jurisdiction_assets ja on ja.asset_id=a.id and ja.jurisdiction_id=jurisdiction.id where a.code=upper(p_asset_code) and a.status='ACTIVE' and ja.status='ACTIVE';
  if asset.id is null then raise exception 'Asset is not enabled for this jurisdiction' using errcode='P0001'; end if;
  if p_opens_at is null or p_closes_at is null or p_resolves_after is null or p_closes_at<=p_opens_at or p_resolves_after<p_closes_at then raise exception 'Invalid market timing' using errcode='22023'; end if;

  v_resolution_scope:=private.derive_market_resolution_scope(proposal,p_title,p_category,p_resolves_after);
  v_resolution_mode:=case upper(coalesce(v_resolution_scope->>'resolver_type',''))
    when 'CRYPTO_PRICE_THRESHOLD_V1' then 'AUTOMATED'
    when 'FOOTBALL_MATCH_RESULT_V1' then 'AUTOMATED'
    else 'VAD_REVIEW'
  end;
  fingerprint:=command.compute_canonical_fingerprint(template.code,p_normalized_parameters,v_resolution_scope::text);
  select ce.id,ce.public_id into event_id,event_public_id from market.canonical_events ce where ce.canonical_fingerprint=fingerprint;
  if event_id is not null then
    existing:=true;
    update market.proposals set matched_canonical_event_id=event_id,canonicalization_decision='EXACT_DUPLICATE',status='MERGED',decision_reason='Merged into existing canonical event',updated_at=statement_timestamp() where id=proposal.id;
  else
    insert into market.canonical_events(template_id,title,description,category,canonical_fingerprint,normalized_parameters,resolution_scope,opens_at,closes_at,resolves_after,status,originator_user_id)
    values(template.id,btrim(p_title),p_description,upper(p_category),fingerprint,p_normalized_parameters,v_resolution_scope,p_opens_at,p_closes_at,p_resolves_after,case when p_opens_at>statement_timestamp() then 'SCHEDULED' else 'APPROVED' end,proposal.proposer_user_id)
    returning id,public_id into event_id,event_public_id;
    update market.proposals set proposed_template_id=template.id,matched_canonical_event_id=event_id,canonicalization_decision='DISTINCT_EVENT',status='APPROVED',normalized_payload=coalesce(normalized_payload,'{}'::jsonb)||jsonb_build_object('approved_parameters',p_normalized_parameters,'resolution_mode',v_resolution_mode),decision_reason='Approved as a new canonical event; VAD resolution path selected automatically; publication pending',updated_at=statement_timestamp() where id=proposal.id;
  end if;

  insert into oracle.event_policy_bindings(event_id,oracle_policy_id,bound_by) values(event_id,oracle_policy.id,auth.uid()) on conflict(event_id) do nothing;
  select i.id,i.public_id,i.status into instrument_id,instrument_public_id,instrument_status from market.instruments i where i.canonical_event_id=event_id and i.asset_id=asset.id;
  if instrument_id is null then
    insert into market.instruments(canonical_event_id,asset_id,market_type,liquidity_model,settlement_unit,pricing_precision,min_order_notional,status,opened_at,closed_at)
    values(event_id,asset.id,'BINARY','ORDER_BOOK',1,p_pricing_precision,p_min_order_notional,'DRAFT',null,p_closes_at)
    returning id,public_id,status into instrument_id,instrument_public_id,instrument_status;
    insert into market.outcomes(instrument_id,code,label,display_order) values(instrument_id,'YES','Yes',1),(instrument_id,'NO','No',2);
  end if;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('MARKET_APPROVED','CANONICAL_EVENT',event_public_id::text,jsonb_build_object('event_id',event_public_id,'instrument_id',instrument_public_id,'asset_code',asset.code,'country_code',jurisdiction.country_code,'merged_existing',existing,'publication_required',instrument_status='DRAFT','resolution_mode',v_resolution_mode),'market-approved:'||p_proposal_public_id::text)
  on conflict(idempotency_key) do nothing;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','MARKET_PROPOSAL_APPROVED','CANONICAL_EVENT',event_public_id::text,'Approved market proposal; VAD selected the resolution path automatically; publication is a separate action',jsonb_build_object('proposal_id',p_proposal_public_id,'instrument_id',instrument_public_id,'asset_code',asset.code,'canonical_fingerprint',fingerprint,'merged_existing',existing,'publication_required',instrument_status='DRAFT','resolution_mode',v_resolution_mode));
  return jsonb_build_object('event_id',event_public_id,'instrument_id',instrument_public_id,'asset_code',asset.code,'merged_existing',existing,'publication_required',instrument_status='DRAFT','instrument_status',instrument_status,'resolution_mode',v_resolution_mode,'resolution_scope',v_resolution_scope);
end;
$$;

insert into public.assets(code,name,symbol,asset_type,minor_units,accounting_precision,display_precision,pricing_precision,status,metadata)
values('TNGN','Test NGN (Sandbox)','₦T','FIAT',2,8,2,6,'ACTIVE',jsonb_build_object('sandbox_only',true,'non_withdrawable',true,'test_credit_amount',100000,'description','Synthetic VAD testing currency; no real-world value'))
on conflict(code) do update set name=excluded.name,symbol=excluded.symbol,status='ACTIVE',metadata=excluded.metadata,updated_at=statement_timestamp();

insert into public.jurisdiction_assets(jurisdiction_id,asset_id,status)
select j.id,a.id,'ACTIVE' from public.jurisdictions j cross join public.assets a where j.country_code='NG' and j.status='ACTIVE' and a.code='TNGN'
on conflict(jurisdiction_id,asset_id) do update set status='ACTIVE';

create or replace function private.grant_test_ngn(p_user_id uuid,p_country_code text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_asset_id bigint;
  v_user_account bigint;
  v_treasury_account bigint;
begin
  if upper(coalesce(p_country_code,''))<>'NG' then return; end if;
  select id into v_asset_id from public.assets where code='TNGN' and status='ACTIVE';
  if v_asset_id is null then return; end if;
  v_user_account:=finance.ensure_user_account(p_user_id,v_asset_id,'USER_AVAILABLE');
  insert into finance.ledger_accounts(asset_id,account_type,owner_type,owner_reference)
  values(v_asset_id,'TREASURY','PLATFORM','SANDBOX_TEST_NGN_ISSUER')
  on conflict(asset_id,account_type,owner_type,owner_reference) do nothing;
  select id into v_treasury_account from finance.ledger_accounts where asset_id=v_asset_id and account_type='TREASURY' and owner_type='PLATFORM' and owner_reference='SANDBOX_TEST_NGN_ISSUER';
  perform finance.transfer(v_asset_id,v_treasury_account,v_user_account,100000,'SANDBOX_TEST_CREDIT','sandbox-test-ngn:'||p_user_id::text,'USER',p_user_id::text,'100,000 Test NGN sandbox credit. Synthetic funds have no cash value and cannot be withdrawn.',null);
end;
$$;
revoke all on function private.grant_test_ngn(uuid,text) from public,anon,authenticated;

create or replace function private.grant_test_ngn_on_account()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.grant_test_ngn(new.user_id,new.country_code);
  return new;
end;
$$;
revoke all on function private.grant_test_ngn_on_account() from public,anon,authenticated;

drop trigger if exists trg_grant_test_ngn_on_account on public.user_accounts;
create trigger trg_grant_test_ngn_on_account after insert on public.user_accounts for each row execute function private.grant_test_ngn_on_account();

do $$ declare r record; begin
  for r in select user_id,country_code from public.user_accounts loop
    perform private.grant_test_ngn(r.user_id,r.country_code);
  end loop;
end $$;

create or replace function public.admin_approve_market_proposal_auto(
  p_proposal_public_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_country_code text,
  p_asset_code text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_template_code text;
  v_policy_public_id uuid;
  v_asset public.assets;
  v_normalized jsonb;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501'; end if;
  if nullif(btrim(p_title),'') is null or nullif(btrim(p_category),'') is null then raise exception 'Market title and category are required' using errcode='22023'; end if;
  if p_opens_at is null or p_closes_at is null or p_resolves_after is null or p_closes_at<=p_opens_at or p_resolves_after<p_closes_at then raise exception 'Choose a valid opening, closing and resolution time' using errcode='22023'; end if;
  select * into v_asset from public.assets where code=upper(btrim(p_asset_code)) and status='ACTIVE';
  if v_asset.id is null then raise exception 'Selected market currency is unavailable' using errcode='P0002'; end if;
  select t.code into v_template_code from market.templates t where t.status='ACTIVE' and t.code='BINARY_EVENT' limit 1;
  if v_template_code is null then select t.code into v_template_code from market.templates t where t.status='ACTIVE' order by t.id limit 1; end if;
  if v_template_code is null then raise exception 'No active market template is available' using errcode='P0001'; end if;
  if coalesce((v_asset.metadata->>'sandbox_only')::boolean,false) then
    select p.public_id into v_policy_public_id from oracle.policies p where p.status='ACTIVE' and p.effective_at<=statement_timestamp() and upper(coalesce(p.consensus_rule->>'environment',''))='SANDBOX' order by p.effective_at desc,p.version desc limit 1;
  else
    select p.public_id into v_policy_public_id from oracle.policies p where p.status='ACTIVE' and p.effective_at<=statement_timestamp() and upper(coalesce(p.consensus_rule->>'environment','PRODUCTION'))<>'SANDBOX' order by p.effective_at desc,p.version desc limit 1;
  end if;
  if v_policy_public_id is null then select p.public_id into v_policy_public_id from oracle.policies p where p.status='ACTIVE' and p.effective_at<=statement_timestamp() order by p.effective_at desc,p.version desc limit 1; end if;
  if v_policy_public_id is null then raise exception 'No active VAD resolution policy is available' using errcode='P0001'; end if;
  v_normalized:=jsonb_build_object('subject',btrim(p_title),'time_scope',p_closes_at,'category',btrim(p_category),'configured_by','VAD_AUTO');
  return public.admin_approve_market_proposal(p_proposal_public_id,v_template_code,btrim(p_title),coalesce(p_description,''),btrim(p_category),v_normalized,'{}'::jsonb,p_opens_at,p_closes_at,p_resolves_after,v_policy_public_id,upper(btrim(p_country_code)),upper(btrim(p_asset_code)),100,4);
end;
$$;
grant execute on function public.admin_approve_market_proposal_auto(uuid,text,text,text,timestamptz,timestamptz,timestamptz,text,text) to authenticated;

create or replace function public.payment_quote(p_operation text, p_asset_code text, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare acct public.user_accounts; asset public.assets; op text:=upper(trim(coalesce(p_operation,''))); provider_id bigint; provider_code text; provider_environment text; access_policy jsonb; fee_policy jsonb; limit_policy jsonb; required_level text; min_amount numeric; max_amount numeric; rate_bps numeric; minimum_fee numeric; fee numeric; cap_key text;
begin
  acct:=private.require_active_account();
  if op not in ('DEPOSIT','WITHDRAWAL') then raise exception 'Unsupported payment operation' using errcode='22023'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Amount must be positive' using errcode='22023'; end if;
  select * into asset from public.assets where code=upper(p_asset_code) and status='ACTIVE' limit 1;
  if asset.id is null then raise exception 'Asset not available' using errcode='P0002'; end if;
  if coalesce((asset.metadata->>'sandbox_only')::boolean,false) or coalesce((asset.metadata->>'non_withdrawable')::boolean,false) then return jsonb_build_object('enabled',false,'reason','SANDBOX_ASSET','operation',op,'assetCode',asset.code,'amount',p_amount,'message','Test NGN is synthetic sandbox currency and cannot be deposited or withdrawn.'); end if;
  if not exists(select 1 from public.jurisdictions j join public.jurisdiction_assets ja on ja.jurisdiction_id=j.id where j.country_code=acct.country_code and j.status='ACTIVE' and ja.asset_id=asset.id and ja.status='ACTIVE') then return jsonb_build_object('enabled',false,'reason','ASSET_NOT_AVAILABLE','operation',op,'assetCode',asset.code,'amount',p_amount); end if;
  cap_key:=case op when 'DEPOSIT' then 'deposit' else 'withdraw' end;
  if not private.capability_enabled(cap_key,acct.country_code) then return jsonb_build_object('enabled',false,'reason','CAPABILITY_DISABLED','operation',op,'assetCode',asset.code,'amount',p_amount); end if;
  access_policy:=coalesce(private.active_policy_configuration('KYC','payment_access'),'{}'::jsonb); fee_policy:=coalesce(private.active_policy_configuration('FEES','payment_fees'),'{}'::jsonb); limit_policy:=coalesce(private.active_policy_configuration('LIMITS','payment_limits'),'{}'::jsonb);
  required_level:=coalesce(access_policy->>(case op when 'DEPOSIT' then 'deposit_min_level' else 'withdrawal_min_level' end),'NONE');
  min_amount:=coalesce((limit_policy->>(case op when 'DEPOSIT' then 'deposit_min' else 'withdrawal_min' end))::numeric,0); max_amount:=(limit_policy->>(case op when 'DEPOSIT' then 'deposit_max' else 'withdrawal_max' end))::numeric;
  if p_amount<min_amount then return jsonb_build_object('enabled',false,'reason','BELOW_MINIMUM','minimum',min_amount,'operation',op,'assetCode',asset.code,'amount',p_amount); end if;
  if max_amount is not null and p_amount>max_amount then return jsonb_build_object('enabled',false,'reason','ABOVE_MAXIMUM','maximum',max_amount,'operation',op,'assetCode',asset.code,'amount',p_amount); end if;
  provider_id:=command.select_provider(op,acct.country_code,asset.id,p_amount);
  if provider_id is null then return jsonb_build_object('enabled',false,'reason','NO_PAYMENT_PROVIDER','operation',op,'assetCode',asset.code,'amount',p_amount,'requiredKycLevel',required_level); end if;
  select code,environment into provider_code,provider_environment from integration.providers where id=provider_id;
  if not private.kyc_access_satisfies(auth.uid(),required_level,provider_environment) then return jsonb_build_object('enabled',false,'reason','KYC_REQUIRED','requiredKycLevel',required_level,'operation',op,'assetCode',asset.code,'amount',p_amount); end if;
  rate_bps:=coalesce((fee_policy->>(case op when 'DEPOSIT' then 'deposit_rate_bps' else 'withdrawal_rate_bps' end))::numeric,0); minimum_fee:=coalesce((fee_policy->>(case op when 'DEPOSIT' then 'deposit_minimum_fee' else 'withdrawal_minimum_fee' end))::numeric,0); fee:=greatest(round((p_amount*rate_bps/10000)::numeric,18),minimum_fee);
  if fee>p_amount then raise exception 'Fee exceeds amount' using errcode='22023'; end if;
  return jsonb_build_object('enabled',true,'reason',null,'operation',op,'assetCode',asset.code,'amount',p_amount,'feeAmount',fee,'netAmount',p_amount-fee,'providerCode',provider_code,'providerEnvironment',provider_environment,'requiredKycLevel',required_level);
end;
$$;
