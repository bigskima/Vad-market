-- Make market liquidity selection asset-configured instead of asset-code hardcoded.
create or replace function private.asset_default_liquidity_model(p_asset_id bigint)
returns text
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_model text;
begin
  select upper(coalesce(nullif(a.metadata->>'default_liquidity_model',''),'ORDER_BOOK'))
  into v_model
  from public.assets a
  where a.id=p_asset_id;

  if v_model is null then
    raise exception 'Asset not found' using errcode='P0002';
  end if;
  if v_model not in ('ORDER_BOOK','AMM','HYBRID','POOL') then
    raise exception 'Invalid default liquidity model configured for asset' using errcode='23514';
  end if;
  return v_model;
end;
$function$;
revoke all on function private.asset_default_liquidity_model(bigint) from public,anon,authenticated;
grant execute on function private.asset_default_liquidity_model(bigint) to service_role;

-- Current launch policy: both test NGN and launch NGN use peer-funded pooled markets.
-- This is configuration data only; runtime behavior reads metadata generically by asset id.
update public.assets
set metadata=(coalesce(metadata,'{}'::jsonb)-'peer_pool_default') || jsonb_build_object(
  'default_liquidity_model','POOL',
  'peer_funded_only',true
),
updated_at=statement_timestamp()
where code in ('TNGN','NGN');

create or replace function public.admin_set_asset_market_liquidity_model(p_asset_code text,p_liquidity_model text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_asset public.assets;
  v_model text:=upper(btrim(coalesce(p_liquidity_model,'')));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if v_model not in ('ORDER_BOOK','AMM','HYBRID','POOL') then
    raise exception 'Unsupported liquidity model' using errcode='22023';
  end if;
  select * into v_asset from public.assets where code=upper(btrim(p_asset_code)) for update;
  if v_asset.id is null then raise exception 'Asset not found' using errcode='P0002'; end if;

  update public.assets
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'default_liquidity_model',v_model,
      'peer_funded_only',case when v_model='POOL' then true else coalesce((metadata->>'peer_funded_only')::boolean,false) end
    ),
    updated_at=statement_timestamp()
  where id=v_asset.id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','ASSET_LIQUIDITY_MODEL_UPDATED','ASSET',v_asset.public_id::text,
         'Updated default market liquidity model',jsonb_build_object('asset_code',v_asset.code,'liquidity_model',v_model));

  return jsonb_build_object('assetCode',v_asset.code,'defaultLiquidityModel',v_model);
end;
$function$;
revoke all on function public.admin_set_asset_market_liquidity_model(text,text) from public,anon;
grant execute on function public.admin_set_asset_market_liquidity_model(text,text) to authenticated,service_role;

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
as $function$
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
  v_liquidity_model text;
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
  v_liquidity_model:=private.asset_default_liquidity_model(asset.id);
  fingerprint:=command.compute_canonical_fingerprint(template.code,p_normalized_parameters,v_resolution_scope::text);
  select ce.id,ce.public_id into event_id,event_public_id from market.canonical_events ce where ce.canonical_fingerprint=fingerprint;
  if event_id is not null then
    existing:=true;
    update market.proposals set matched_canonical_event_id=event_id,canonicalization_decision='EXACT_DUPLICATE',status='MERGED',decision_reason='Merged into existing canonical event',updated_at=statement_timestamp() where id=proposal.id;
  else
    insert into market.canonical_events(template_id,title,description,category,canonical_fingerprint,normalized_parameters,resolution_scope,opens_at,closes_at,resolves_after,status,originator_user_id)
    values(template.id,btrim(p_title),p_description,upper(p_category),fingerprint,p_normalized_parameters,v_resolution_scope,p_opens_at,p_closes_at,p_resolves_after,case when p_opens_at>statement_timestamp() then 'SCHEDULED' else 'APPROVED' end,proposal.proposer_user_id)
    returning id,public_id into event_id,event_public_id;
    update market.proposals set proposed_template_id=template.id,matched_canonical_event_id=event_id,canonicalization_decision='DISTINCT_EVENT',status='APPROVED',normalized_payload=coalesce(normalized_payload,'{}'::jsonb)||jsonb_build_object('approved_parameters',p_normalized_parameters,'resolution_mode',v_resolution_mode,'liquidity_model',v_liquidity_model),decision_reason='Approved as a new canonical event; VAD resolution and liquidity paths selected automatically; publication pending',updated_at=statement_timestamp() where id=proposal.id;
  end if;

  insert into oracle.event_policy_bindings(event_id,oracle_policy_id,bound_by)
  values(event_id,oracle_policy.id,auth.uid())
  on conflict on constraint event_policy_bindings_pkey do nothing;

  select i.id,i.public_id,i.status into instrument_id,instrument_public_id,instrument_status from market.instruments i where i.canonical_event_id=event_id and i.asset_id=asset.id;
  if instrument_id is null then
    insert into market.instruments(canonical_event_id,asset_id,market_type,liquidity_model,settlement_unit,pricing_precision,min_order_notional,status,opened_at,closed_at)
    values(event_id,asset.id,'BINARY',v_liquidity_model,1,p_pricing_precision,p_min_order_notional,'DRAFT',null,p_closes_at)
    returning id,public_id,status into instrument_id,instrument_public_id,instrument_status;
    insert into market.outcomes(instrument_id,code,label,display_order) values(instrument_id,'YES','Yes',1),(instrument_id,'NO','No',2);
  end if;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('MARKET_APPROVED','CANONICAL_EVENT',event_public_id::text,jsonb_build_object('event_id',event_public_id,'instrument_id',instrument_public_id,'asset_code',asset.code,'country_code',jurisdiction.country_code,'merged_existing',existing,'publication_required',instrument_status='DRAFT','resolution_mode',v_resolution_mode,'liquidity_model',v_liquidity_model),'market-approved:'||p_proposal_public_id::text)
  on conflict(idempotency_key) do nothing;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','MARKET_PROPOSAL_APPROVED','CANONICAL_EVENT',event_public_id::text,'Approved market proposal; VAD selected resolution and liquidity paths from policy/configuration; publication is a separate action',jsonb_build_object('proposal_id',p_proposal_public_id,'instrument_id',instrument_public_id,'asset_code',asset.code,'canonical_fingerprint',fingerprint,'merged_existing',existing,'publication_required',instrument_status='DRAFT','resolution_mode',v_resolution_mode,'liquidity_model',v_liquidity_model));
  return jsonb_build_object('event_id',event_public_id,'instrument_id',instrument_public_id,'asset_code',asset.code,'merged_existing',existing,'publication_required',instrument_status='DRAFT','instrument_status',instrument_status,'resolution_mode',v_resolution_mode,'resolution_scope',v_resolution_scope,'liquidity_model',v_liquidity_model);
end;
$function$;

-- Guard old order-book endpoints from being used on pooled markets.
create or replace function public.trade_quote(p_instrument_public_id uuid,p_outcome_code text,p_side text,p_price numeric,p_quantity numeric)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  acct public.user_accounts;
  instrument market.instruments;
  outcome market.outcomes;
  notional numeric(38,18);
  fee_reserve numeric(38,18):=0;
  maker_fee numeric(38,18):=0;
  taker_fee numeric(38,18):=0;
  available_shares numeric(38,18):=0;
  maker_policy bigint;
  taker_policy bigint;
begin
  acct:=private.require_active_account();
  select * into instrument from market.instruments where public_id=p_instrument_public_id;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.liquidity_model='POOL' then raise exception 'This market uses peer-funded pooled staking' using errcode='P0001'; end if;
  if not private.trade_access_satisfies(auth.uid(),acct.country_code,instrument.asset_id) then raise exception 'Trading is not available for this account and market' using errcode='P0001'; end if;
  if instrument.status<>'OPEN' then raise exception 'Market is not open' using errcode='P0001'; end if;
  select * into outcome from market.outcomes where instrument_id=instrument.id and code=upper(trim(p_outcome_code));
  if outcome.id is null then raise exception 'Outcome not found' using errcode='P0002'; end if;
  if upper(p_side) not in ('BUY','SELL') then raise exception 'Invalid side' using errcode='22023'; end if;
  if p_price is null or p_price<=0 or p_price>=instrument.settlement_unit then raise exception 'Invalid price' using errcode='22023'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Invalid quantity' using errcode='22023'; end if;
  notional:=round(p_price*p_quantity,18);
  if notional<instrument.min_order_notional then raise exception 'Order is below market minimum notional' using errcode='22023'; end if;
  select q.fee_amount,q.policy_version_id into maker_fee,maker_policy from command.quote_trading_fee(notional,'MAKER') q;
  select q.fee_amount,q.policy_version_id into taker_fee,taker_policy from command.quote_trading_fee(notional,'TAKER') q;
  if upper(p_side)='BUY' then select q.fee_amount into fee_reserve from command.max_trading_fee_reserve(notional) q;
  else available_shares:=command.position_available_to_sell(auth.uid(),instrument.id,outcome.id); end if;
  return jsonb_build_object('instrumentPublicId',instrument.public_id,'instrumentId',instrument.id,'outcomeId',outcome.id,'outcomeCode',outcome.code,'side',upper(p_side),'price',p_price,'quantity',p_quantity,'notional',notional,'settlementUnit',instrument.settlement_unit,'potentialGrossSettlement',round(p_quantity*instrument.settlement_unit,18),'makerFee',maker_fee,'takerFee',taker_fee,'maximumFeeReserve',fee_reserve,'maximumCashReservation',case when upper(p_side)='BUY' then notional+fee_reserve else 0 end,'availableSharesToSell',available_shares,'makerFeePolicyVersionId',maker_policy,'takerFeePolicyVersionId',taker_policy,'quotedAt',statement_timestamp());
end;
$function$;

create or replace function public.place_order(p_market_id bigint,p_outcome_id bigint,p_side text,p_price numeric,p_quantity numeric,p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  account public.user_accounts;
  instrument market.instruments;
begin
  account:=private.require_active_account();
  select * into instrument from market.instruments where id=p_market_id;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.liquidity_model='POOL' then raise exception 'This market uses peer-funded pooled staking' using errcode='P0001'; end if;
  if not private.trade_access_satisfies(auth.uid(),account.country_code,instrument.asset_id) then raise exception 'Trading is not available for this account and market' using errcode='P0001'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key)<8 or char_length(p_idempotency_key)>200 then raise exception 'A valid idempotency key is required' using errcode='22023'; end if;
  return command.reserve_for_order(auth.uid(),p_market_id,p_outcome_id,upper(p_side),p_price,p_quantity,p_idempotency_key);
end;
$function$;