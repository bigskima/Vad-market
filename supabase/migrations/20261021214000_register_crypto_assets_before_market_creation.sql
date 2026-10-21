begin;

create or replace function public.admin_register_crypto_oracle_asset(
  p_symbol text,
  p_coin_gecko_id text,
  p_pyth_feed_symbol text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_symbol text:=upper(btrim(coalesce(p_symbol,'')));
  v_coin_id text:=lower(btrim(coalesce(p_coin_gecko_id,'')));
  v_pyth_symbol text:=btrim(coalesce(p_pyth_feed_symbol,''));
  v_pyth_provider integration.providers;
  v_coin_provider integration.providers;
  v_pyth_existing oracle.provider_resources;
  v_coin_existing oracle.provider_resources;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if v_symbol !~ '^[A-Z0-9]{2,20}$' then
    raise exception 'Choose a valid crypto ticker.' using errcode='22023';
  end if;
  if v_coin_id !~ '^[a-z0-9][a-z0-9-]{1,89}$' then
    raise exception 'Choose a valid CoinGecko asset ID from the live catalogue.' using errcode='22023';
  end if;
  if upper(v_pyth_symbol)<>upper('Crypto.'||v_symbol||'/USD') then
    raise exception 'The Pyth feed symbol must match the exact selected ticker/USD pair.' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'Provide a reason for registering the crypto resolution asset.' using errcode='22023';
  end if;

  select * into v_pyth_provider from integration.providers
  where code='PYTH' and provider_type='ORACLE' and environment='PRODUCTION'
    and status in ('ACTIVE','DEGRADED')
    and capabilities @> array['CRYPTO_PRICE_THRESHOLD']::text[]
  limit 1;
  select * into v_coin_provider from integration.providers
  where code='COINGECKO' and provider_type='ORACLE' and environment='PRODUCTION'
    and status in ('ACTIVE','DEGRADED')
    and capabilities @> array['CRYPTO_PRICE_THRESHOLD']::text[]
  limit 1;
  if v_pyth_provider.id is null or v_coin_provider.id is null then
    raise exception 'The approved Pyth and CoinGecko historical price providers must be active.' using errcode='P0001';
  end if;

  select * into v_pyth_existing from oracle.provider_resources
  where provider_id=v_pyth_provider.id and resource_type='CRYPTO_PAIR'
    and canonical_key=v_symbol||'/USD' for update;
  if v_pyth_existing.id is not null
     and (v_pyth_existing.external_key<>('Crypto.'||v_symbol||'/USD')) then
    raise exception 'This ticker is already mapped to a different Pyth feed. Do not overwrite existing Oracle mappings.' using errcode='23505';
  end if;

  select * into v_coin_existing from oracle.provider_resources
  where provider_id=v_coin_provider.id and resource_type='CRYPTO_PAIR'
    and canonical_key=v_symbol||'/USD' for update;
  if v_coin_existing.id is not null and v_coin_existing.external_key<>v_coin_id then
    raise exception 'This ticker is already mapped to a different CoinGecko asset ID. Choose the mapped asset or reconcile the Oracle mapping first.' using errcode='23505';
  end if;

  insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
  values(
    v_pyth_provider.id,'CRYPTO_PAIR',v_symbol||'/USD','Crypto.'||v_symbol||'/USD','ACTIVE',
    jsonb_build_object('quote','USD','settlement_eligible',true,
      'max_timestamp_delta_seconds',120,'historical_mode','EXACT_SYMBOL',
      'discovery','ADMIN_GUIDED_EXACT_PYTH_FEED','registered_by',auth.uid())
  )
  on conflict(provider_id,resource_type,canonical_key) do update set
    status='ACTIVE',
    metadata=oracle.provider_resources.metadata||excluded.metadata,
    updated_at=statement_timestamp()
  where oracle.provider_resources.external_key=excluded.external_key;

  insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
  values(
    v_coin_provider.id,'CRYPTO_PAIR',v_symbol||'/USD',v_coin_id,'ACTIVE',
    jsonb_build_object('quote','USD','settlement_eligible',true,
      'max_timestamp_delta_seconds',600,'historical_mode','RANGE_NEAREST',
      'discovery','ADMIN_GUIDED_COINGECKO_ASSET_ID','registered_by',auth.uid())
  )
  on conflict(provider_id,resource_type,canonical_key) do update set
    status='ACTIVE',
    metadata=oracle.provider_resources.metadata||excluded.metadata,
    updated_at=statement_timestamp()
  where oracle.provider_resources.external_key=excluded.external_key;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','CRYPTO_ORACLE_ASSET_REGISTERED','CRYPTO_PAIR',v_symbol||'/USD',
    btrim(p_reason),jsonb_build_object(
      'symbol',v_symbol,'coin_gecko_id',v_coin_id,'pyth_feed_symbol',v_pyth_symbol,
      'providers',jsonb_build_array('PYTH','COINGECKO')));

  return jsonb_build_object(
    'registered',true,'symbol',v_symbol,'quote','USD',
    'coin_gecko_id',v_coin_id,'pyth_feed_symbol',v_pyth_symbol);
end;
$function$;
revoke all on function public.admin_register_crypto_oracle_asset(text,text,text,text) from public,anon;
grant execute on function public.admin_register_crypto_oracle_asset(text,text,text,text) to authenticated;


create or replace function public.admin_create_crypto_threshold_market(
  p_title text,p_description text,p_market_type_code text,p_details jsonb,p_condition text,
  p_source_name text,p_source_url text,p_opens_at timestamptz,p_closes_at timestamptz,
  p_resolves_after timestamptz,p_country_code text,p_asset_code text,p_liquidity_model text,
  p_publish_now boolean default false
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_details jsonb:=coalesce(p_details,'{}'::jsonb);
  v_symbol text:=upper(btrim(coalesce(v_details->>'asset_symbol','')));
  v_coin_id text:=lower(btrim(coalesce(v_details->>'coingecko_id','')));
  v_quote text:=upper(btrim(coalesce(v_details->>'quote','USD')));
  v_operator text:=upper(btrim(coalesce(v_details->>'operator','')));
  v_threshold numeric;
  v_result jsonb;
  v_instrument market.instruments;
  v_event market.canonical_events;
  v_asset public.assets;
  v_policy_id bigint;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if upper(btrim(coalesce(p_market_type_code,'')))<>'CRYPTO_PRICE_THRESHOLD' then
    raise exception 'Crypto markets must use the approved threshold market type.' using errcode='22023';
  end if;
  if v_symbol !~ '^[A-Z0-9]{2,20}$' then
    raise exception 'Select a valid crypto symbol from the live asset catalog.' using errcode='22023';
  end if;
  if v_coin_id !~ '^[a-z0-9][a-z0-9-]{1,89}$' then
    raise exception 'Select the crypto asset from the live catalog so the provider ID is unambiguous.' using errcode='22023';
  end if;
  if v_quote<>'USD' then raise exception 'Automatic crypto resolution currently requires USD pairs.' using errcode='22023'; end if;
  if v_operator not in ('GT','GTE','LT','LTE') then
    raise exception 'Choose a supported price comparison.' using errcode='22023';
  end if;
  if coalesce(v_details->>'threshold','') !~ '^[0-9]+([.][0-9]{1,18})?$' then
    raise exception 'Enter a positive numeric USD target.' using errcode='22023';
  end if;
  v_threshold:=(v_details->>'threshold')::numeric;
  if v_threshold<=0 then raise exception 'The USD target must be greater than zero.' using errcode='22023'; end if;
  if p_resolves_after is null or p_closes_at is null or p_resolves_after<=p_closes_at then
    raise exception 'The observation time must be after the trading close.' using errcode='22023';
  end if;

  -- A market may only use a crypto pair after an exact Pyth feed and the
  -- CoinGecko ID were confirmed and registered by the guided admin flow.
  -- Never re-point an existing symbol to a different coin, because older
  -- published markets resolve by canonical symbol.
  if not exists(
    select 1 from oracle.provider_resources r
    join integration.providers p on p.id=r.provider_id
    where p.code='PYTH' and p.environment='PRODUCTION' and p.provider_type='ORACLE'
      and p.status in ('ACTIVE','DEGRADED')
      and r.resource_type='CRYPTO_PAIR' and r.canonical_key=v_symbol||'/'||v_quote
      and r.external_key='Crypto.'||v_symbol||'/'||v_quote and r.status='ACTIVE'
  ) then
    raise exception 'This crypto asset has not been registered with its exact Pyth/USD feed. Re-run the Oracle feed check.' using errcode='P0001';
  end if;
  if not exists(
    select 1 from oracle.provider_resources r
    join integration.providers p on p.id=r.provider_id
    where p.code='COINGECKO' and p.environment='PRODUCTION' and p.provider_type='ORACLE'
      and p.status in ('ACTIVE','DEGRADED')
      and r.resource_type='CRYPTO_PAIR' and r.canonical_key=v_symbol||'/'||v_quote
      and r.external_key=v_coin_id and r.status='ACTIVE'
  ) then
    raise exception 'This CoinGecko asset ID has not been registered for the selected ticker. Re-run the Oracle feed check.' using errcode='P0001';
  end if;

  v_result:=public.admin_create_catalog_market_v2(
    p_title,p_description,p_market_type_code,v_details,p_condition,p_source_name,p_source_url,
    p_opens_at,p_closes_at,p_resolves_after,p_country_code,p_asset_code,p_liquidity_model,p_publish_now
  );
  select * into v_instrument from market.instruments
    where public_id=(v_result->>'instrument_id')::uuid for update;
  if v_instrument.id is null then raise exception 'Created crypto instrument could not be found.' using errcode='P0002'; end if;
  select * into v_event from market.canonical_events where id=v_instrument.canonical_event_id for update;
  if v_event.id is null then raise exception 'Created crypto event could not be found.' using errcode='P0002'; end if;
  select * into v_asset from public.assets where id=v_instrument.asset_id;
  if v_asset.id is null then raise exception 'Created market currency could not be found.' using errcode='P0002'; end if;

  update market.canonical_events e
  set category='CRYPTO_WEB3',
      normalized_parameters=e.normalized_parameters||jsonb_build_object(
        'crypto_asset_symbol',v_symbol,'coin_gecko_id',v_coin_id,'quote_currency',v_quote,
        'threshold_operator',v_operator,'threshold_value',v_threshold),
      resolution_scope=e.resolution_scope||jsonb_build_object(
        'resolver_type','CRYPTO_PRICE_THRESHOLD_V1','category','CRYPTO_WEB3',
        'asset',v_symbol,'quote',v_quote,'operator',v_operator,'threshold',v_threshold,
        'observation_time',p_resolves_after,
        'subject',jsonb_build_object('asset',v_symbol,'symbol',v_symbol,'quote',v_quote,'coin_id',v_coin_id),
        'market_question',p_title,
        'condition',coalesce(nullif(btrim(coalesce(p_condition,'')),''),v_symbol||'/USD '||v_operator||' '||v_threshold::text),
        'verification','Resolution uses approved historical Pyth and CoinGecko observations in the configured observation window. Live display quotes do not determine outcomes.',
        'configured_by','ADMIN_GUIDED_CRYPTO_THRESHOLD'),
      updated_at=statement_timestamp()
  where e.id=v_event.id returning * into v_event;

  select p.id into v_policy_id
  from oracle.policies p
  join oracle.capabilities c on c.id=p.capability_id
  where p.status='ACTIVE' and p.effective_at<=statement_timestamp()
    and c.code='OBJECTIVE_EVENT_RESULT'
    and (
      (coalesce((v_asset.metadata->>'sandbox_only')::boolean,false)
        and upper(coalesce(p.consensus_rule->>'environment',''))='SANDBOX')
      or
      (not coalesce((v_asset.metadata->>'sandbox_only')::boolean,false)
        and upper(coalesce(p.consensus_rule->>'environment','PRODUCTION'))<>'SANDBOX')
    )
    and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h where upper(coalesce(h->>'provider_code',''))='PYTH')
    and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h where upper(coalesce(h->>'provider_code',''))='COINGECKO')
  order by p.effective_at desc,p.version desc limit 1;
  if v_policy_id is null then raise exception 'An active Pyth/CoinGecko crypto resolution policy is unavailable.' using errcode='P0001'; end if;

  update oracle.event_policy_bindings
  set oracle_policy_id=v_policy_id,bound_at=statement_timestamp(),bound_by=auth.uid()
  where event_id=v_event.id;
  if not found then
    insert into oracle.event_policy_bindings(event_id,oracle_policy_id,bound_at,bound_by)
    values(v_event.id,v_policy_id,statement_timestamp(),auth.uid());
  end if;

  insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
  select p.id,'CRYPTO_PAIR',v_symbol||'/'||v_quote,
    case p.code when 'PYTH' then 'Crypto.'||v_symbol||'/'||v_quote else v_coin_id end,
    'ACTIVE',jsonb_build_object('quote',v_quote,'settlement_eligible',true,
      'max_timestamp_delta_seconds',case when p.code='PYTH' then 120 else 600 end,
      'historical_mode',case when p.code='COINGECKO' then 'RANGE_NEAREST' else 'EXACT_SYMBOL' end,
      'discovery','ADMIN_APPROVED_SYMBOL_AND_COIN_ID')
  from integration.providers p
  where p.provider_type='ORACLE' and p.environment='PRODUCTION'
    and p.code in ('PYTH','COINGECKO')
  on conflict(provider_id,resource_type,canonical_key) do update set
    external_key=excluded.external_key,status='ACTIVE',
    metadata=excluded.metadata,updated_at=statement_timestamp();

  perform command.refresh_market_catalog(v_instrument.id);
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','CRYPTO_THRESHOLD_MARKET_CONFIGURED','MARKET',v_instrument.public_id::text,
    'Created a crypto threshold market using approved historical Oracle providers',
    jsonb_build_object('symbol',v_symbol,'coin_gecko_id',v_coin_id,'quote',v_quote,
      'operator',v_operator,'threshold',v_threshold,'observation_time',p_resolves_after,
      'oracle_policy_id',v_policy_id,'providers',jsonb_build_array('PYTH','COINGECKO')));
  return v_result||jsonb_build_object('resolver_type','CRYPTO_PRICE_THRESHOLD_V1',
    'oracle_policy_id',v_policy_id,'crypto_asset',v_symbol,'coin_gecko_id',v_coin_id);
end;
$function$;
revoke all on function public.admin_create_crypto_threshold_market(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,boolean) from public,anon;
grant execute on function public.admin_create_crypto_threshold_market(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,boolean) to authenticated;

commit;
