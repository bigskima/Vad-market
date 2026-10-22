begin;

-- Keep the checked-in database RPC aligned with the production Coinbase/Kraken
-- implementation while preserving Oracle dual-control policy approval.
CREATE OR REPLACE FUNCTION public.admin_create_crypto_threshold_market(p_title text, p_description text, p_market_type_code text, p_details jsonb, p_condition text, p_source_name text, p_source_url text, p_opens_at timestamp with time zone, p_closes_at timestamp with time zone, p_resolves_after timestamp with time zone, p_country_code text, p_asset_code text, p_liquidity_model text, p_publish_now boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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


  -- Both independent, keyless public candle providers must have an exact ACTIVE
  -- mapping for this ticker/quote. UI validation alone is never trusted.
  if not exists(
    select 1 from oracle.provider_resources r
    join integration.providers p on p.id=r.provider_id
    where p.code='COINBASE' and p.environment='PRODUCTION' and p.provider_type='ORACLE'
      and p.status in ('ACTIVE','DEGRADED')
      and r.resource_type='CRYPTO_PAIR' and r.canonical_key=v_symbol||'/'||v_quote
      and r.external_key=v_symbol||'-'||v_quote and r.status='ACTIVE'
  ) then
    raise exception 'This crypto asset has no active Coinbase public historical-price mapping. Re-run the free Oracle coverage check.' using errcode='P0001';
  end if;
  if not exists(
    select 1 from oracle.provider_resources r
    join integration.providers p on p.id=r.provider_id
    where p.code='KRAKEN' and p.environment='PRODUCTION' and p.provider_type='ORACLE'
      and p.status in ('ACTIVE','DEGRADED')
      and r.resource_type='CRYPTO_PAIR' and r.canonical_key=v_symbol||'/'||v_quote
      and r.status='ACTIVE'
  ) then
    raise exception 'This crypto asset has no active Kraken public historical-price mapping. Re-run the free Oracle coverage check.' using errcode='P0001';
  end if;

  -- A catalog mapping is not proof that the deployed Oracle runtime can
  -- resolve an observation. Do not create automatic markets while a source
  -- is excluded from routing by a currently confirmed UNAVAILABLE health state.
  if exists(
    select 1
    from integration.providers p
    left join lateral (
      select h.status from integration.provider_health h
      where h.provider_id=p.id order by h.checked_at desc nulls last limit 1
    ) latest_health on true
    where p.code in ('COINBASE','KRAKEN')
      and p.environment='PRODUCTION' and p.provider_type='ORACLE'
      and upper(coalesce(latest_health.status,'UNKNOWN'))='UNAVAILABLE'
  ) then
    raise exception 'A required Coinbase/Kraken Oracle source is marked unavailable. Deploy the current Oracle runtime and run Admin > Providers > Check oracle providers before creating an automatic crypto threshold market.'
      using errcode='P0001';
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
        'verification','Resolution uses approved public historical Coinbase and Kraken observations in the configured observation window. Live display quotes do not determine outcomes.',
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
    and p.approved_by is not null
    and upper(coalesce(p.consensus_rule->>'distinct_providers','false'))='TRUE'
    and case
      when coalesce(p.consensus_rule->>'min_agreeing_providers','') ~ '^[0-9]+
  order by p.effective_at desc,p.version desc limit 1;
  if v_policy_id is null then
    raise exception 'The Coinbase/Kraken policy is not approved yet. An Oracle reviewer must approve the latest free-source policy before automatic threshold markets can be created.' using errcode='P0001';
  end if;

  update oracle.event_policy_bindings
  set oracle_policy_id=v_policy_id,bound_at=statement_timestamp(),bound_by=auth.uid()
  where event_id=v_event.id;
  if not found then
    insert into oracle.event_policy_bindings(event_id,oracle_policy_id,bound_at,bound_by)
    values(v_event.id,v_policy_id,statement_timestamp(),auth.uid());
  end if;


  insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
  select p.id,'CRYPTO_PAIR',v_symbol||'/'||v_quote,
    case p.code
      when 'COINBASE' then v_symbol||'-'||v_quote
      when 'KRAKEN' then case v_symbol
        when 'BTC' then 'XBTUSD'
        else v_symbol||'USD'
      end
    end,
    'ACTIVE',jsonb_build_object(
      'quote',v_quote,
      'max_timestamp_delta_seconds',600,
      'maximum_coverage_gap_seconds',900,
      'historical_mode',case p.code when 'KRAKEN' then 'OHLC' else 'CANDLE' end,
      'settlement_eligible',true,
      'discovery','ADMIN_APPROVED_KEYLESS_SOURCE_MAPPINGS'
    )
  from integration.providers p
  where p.provider_type='ORACLE' and p.environment='PRODUCTION'
    and p.code in ('COINBASE','KRAKEN')
  on conflict(provider_id,resource_type,canonical_key) do update set
    external_key=excluded.external_key,status='ACTIVE',
    metadata=excluded.metadata,updated_at=statement_timestamp();

  perform command.refresh_market_catalog(v_instrument.id);
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','CRYPTO_THRESHOLD_MARKET_CONFIGURED','MARKET',v_instrument.public_id::text,
    'Created a crypto threshold market using approved keyless public historical Oracle providers',
    jsonb_build_object('symbol',v_symbol,'coin_gecko_id',v_coin_id,'quote',v_quote,
      'operator',v_operator,'threshold',v_threshold,'observation_time',p_resolves_after,
      'oracle_policy_id',v_policy_id,'providers',jsonb_build_array('COINBASE','KRAKEN')));
  return v_result||jsonb_build_object('resolver_type','CRYPTO_PRICE_THRESHOLD_V1',
    'oracle_policy_id',v_policy_id,'crypto_asset',v_symbol,'coin_gecko_id',v_coin_id);
end;
$function$

        then (p.consensus_rule->>'min_agreeing_providers')::integer
      else 0
    end >= 2
    and jsonb_array_length(coalesce(p.source_hierarchy,'[]'::jsonb))=2
    and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h
      where upper(coalesce(h->>'provider_code',''))='COINBASE'
        and upper(coalesce(h->>'role',''))='PRIMARY')
    and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h
      where upper(coalesce(h->>'provider_code',''))='KRAKEN'
        and upper(coalesce(h->>'role',''))='CORROBORATING')
  order by p.effective_at desc,p.version desc limit 1;
  if v_policy_id is null then
    raise exception 'The Coinbase/Kraken policy is not approved yet. An Oracle reviewer must approve the latest free-source policy before automatic threshold markets can be created.' using errcode='P0001';
  end if;

  update oracle.event_policy_bindings
  set oracle_policy_id=v_policy_id,bound_at=statement_timestamp(),bound_by=auth.uid()
  where event_id=v_event.id;
  if not found then
    insert into oracle.event_policy_bindings(event_id,oracle_policy_id,bound_at,bound_by)
    values(v_event.id,v_policy_id,statement_timestamp(),auth.uid());
  end if;


  insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
  select p.id,'CRYPTO_PAIR',v_symbol||'/'||v_quote,
    case p.code
      when 'COINBASE' then v_symbol||'-'||v_quote
      when 'KRAKEN' then case v_symbol
        when 'BTC' then 'XBTUSD'
        else v_symbol||'USD'
      end
    end,
    'ACTIVE',jsonb_build_object(
      'quote',v_quote,
      'max_timestamp_delta_seconds',600,
      'maximum_coverage_gap_seconds',900,
      'historical_mode',case p.code when 'KRAKEN' then 'OHLC' else 'CANDLE' end,
      'settlement_eligible',true,
      'discovery','ADMIN_APPROVED_KEYLESS_SOURCE_MAPPINGS'
    )
  from integration.providers p
  where p.provider_type='ORACLE' and p.environment='PRODUCTION'
    and p.code in ('COINBASE','KRAKEN')
  on conflict(provider_id,resource_type,canonical_key) do update set
    external_key=excluded.external_key,status='ACTIVE',
    metadata=excluded.metadata,updated_at=statement_timestamp();

  perform command.refresh_market_catalog(v_instrument.id);
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','CRYPTO_THRESHOLD_MARKET_CONFIGURED','MARKET',v_instrument.public_id::text,
    'Created a crypto threshold market using approved keyless public historical Oracle providers',
    jsonb_build_object('symbol',v_symbol,'coin_gecko_id',v_coin_id,'quote',v_quote,
      'operator',v_operator,'threshold',v_threshold,'observation_time',p_resolves_after,
      'oracle_policy_id',v_policy_id,'providers',jsonb_build_array('COINBASE','KRAKEN')));
  return v_result||jsonb_build_object('resolver_type','CRYPTO_PRICE_THRESHOLD_V1',
    'oracle_policy_id',v_policy_id,'crypto_asset',v_symbol,'coin_gecko_id',v_coin_id);
end;
$function$;




-- A single service-only readiness view keeps the admin preflight aligned with
-- the exact policy quorum and provider-health gates used by market creation.
create or replace function public.internal_crypto_threshold_policy_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_production_ready boolean:=false;
  v_sandbox_ready boolean:=false;
  v_production_version integer;
  v_sandbox_version integer;
  v_coinbase_health text:='UNKNOWN';
  v_kraken_health text:='UNKNOWN';
  v_coinbase_failure text;
  v_kraken_failure text;
  v_sources_ready boolean:=false;
  v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  with eligible as (
    select p.version,
      upper(coalesce(nullif(p.consensus_rule->>'environment',''),'PRODUCTION')) as environment
    from oracle.policies p
    join oracle.capabilities c on c.id=p.capability_id
    where c.code='OBJECTIVE_EVENT_RESULT'
      and p.status='ACTIVE'
      and p.approved_by is not null
      and p.effective_at<=statement_timestamp()
      and upper(coalesce(p.consensus_rule->>'distinct_providers','false'))='TRUE'
      and case
        when coalesce(p.consensus_rule->>'min_agreeing_providers','') ~ '^[0-9]+$'
          then (p.consensus_rule->>'min_agreeing_providers')::integer
        else 0
      end >= 2
      and jsonb_array_length(coalesce(p.source_hierarchy,'[]'::jsonb))=2
      and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h
        where upper(coalesce(h->>'provider_code',''))='COINBASE'
          and upper(coalesce(h->>'role',''))='PRIMARY')
      and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h
        where upper(coalesce(h->>'provider_code',''))='KRAKEN'
          and upper(coalesce(h->>'role',''))='CORROBORATING')
  )
  select
    coalesce(bool_or(environment<>'SANDBOX'),false),
    coalesce(bool_or(environment='SANDBOX'),false),
    max(version) filter(where environment<>'SANDBOX'),
    max(version) filter(where environment='SANDBOX')
  into v_production_ready,v_sandbox_ready,v_production_version,v_sandbox_version
  from eligible;

  select coalesce(h.status,'UNKNOWN'),h.metadata->>'failure_code'
  into v_coinbase_health,v_coinbase_failure
  from integration.providers p
  left join lateral (
    select status,metadata from integration.provider_health
    where provider_id=p.id order by checked_at desc nulls last limit 1
  ) h on true
  where p.code='COINBASE' and p.environment='PRODUCTION'
    and p.provider_type='ORACLE' and p.status in ('ACTIVE','DEGRADED')
    and p.capabilities @> '["CRYPTO_PRICE_THRESHOLD"]'::jsonb
    and coalesce((p.public_metadata->>'configured')::boolean,false);
  if not found then
    v_coinbase_health:='UNAVAILABLE';
    v_coinbase_failure:='PROVIDER_NOT_CONFIGURED';
  end if;

  select coalesce(h.status,'UNKNOWN'),h.metadata->>'failure_code'
  into v_kraken_health,v_kraken_failure
  from integration.providers p
  left join lateral (
    select status,metadata from integration.provider_health
    where provider_id=p.id order by checked_at desc nulls last limit 1
  ) h on true
  where p.code='KRAKEN' and p.environment='PRODUCTION'
    and p.provider_type='ORACLE' and p.status in ('ACTIVE','DEGRADED')
    and p.capabilities @> '["CRYPTO_PRICE_THRESHOLD"]'::jsonb
    and coalesce((p.public_metadata->>'configured')::boolean,false);
  if not found then
    v_kraken_health:='UNAVAILABLE';
    v_kraken_failure:='PROVIDER_NOT_CONFIGURED';
  end if;

  v_sources_ready := v_coinbase_health<>'UNAVAILABLE'
    and v_kraken_health<>'UNAVAILABLE';

  v_result:=jsonb_build_object(
    'available',true,
    'productionPolicyReady',v_production_ready,
    'sandboxPolicyReady',v_sandbox_ready,
    'productionPolicyVersion',v_production_version,
    'sandboxPolicyVersion',v_sandbox_version,
    'providersRuntimeReady',v_sources_ready,
    'coinbaseHealth',v_coinbase_health,
    'krakenHealth',v_kraken_health,
    'coinbaseFailureCode',v_coinbase_failure,
    'krakenFailureCode',v_kraken_failure,
    'productionReason',case when v_production_ready then null
      else 'No active, approved Coinbase/Kraken production policy with the required distinct two-provider quorum is available.' end,
    'sandboxReason',case when v_sandbox_ready then null
      else 'No active, approved Coinbase/Kraken sandbox policy with the required distinct two-provider quorum is available.' end,
    'providerReason',case when v_sources_ready then null
      else 'At least one required settlement provider is currently marked unavailable. Run a fresh Oracle provider health check before creating this market.' end
  );
  return v_result;
end;
$function$;

revoke all on function public.internal_crypto_threshold_policy_readiness() from public,anon,authenticated;
grant execute on function public.internal_crypto_threshold_policy_readiness() to service_role;


select pg_notify('pgrst','reload schema');
commit;
