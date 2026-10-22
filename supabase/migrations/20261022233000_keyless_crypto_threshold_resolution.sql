begin;

-- Kraken and Coinbase expose public historical candles without an API key.
-- Keep the settlement pair registry explicit and fail-closed for unmapped assets.
insert into integration.providers as current_provider
  (code,name,provider_type,environment,status,priority,capabilities,public_metadata,secret_reference)
values
  ('KRAKEN','Kraken Public Historical OHLC','ORACLE','PRODUCTION','ACTIVE',22,
   '["CRYPTO_PRICE_THRESHOLD","FINANCIAL_PRICE_THRESHOLD"]'::jsonb,
   '{"configured":true,"adapter":"KRAKEN_PUBLIC_OHLC_V1","base_url":"https://api.kraken.com","health_probe":"PUBLIC_OHLC","credential_mode":"NONE","settlement_role":"KEYLESS_HISTORICAL_PRICE_CORROBORATION"}'::jsonb,
   null)
on conflict(code,environment) do update set
  name=excluded.name,
  priority=excluded.priority,
  capabilities=current_provider.capabilities || excluded.capabilities,
  public_metadata=current_provider.public_metadata || excluded.public_metadata,
  updated_at=statement_timestamp();

insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'CRYPTO_PAIR',v.canonical_key,v.external_key,'ACTIVE',
  jsonb_build_object(
    'quote','USD',
    'historical_mode','OHLC',
    'max_timestamp_delta_seconds',600,
    'maximum_coverage_gap_seconds',900,
    'credential_mode','NONE',
    'configured_by','KEYLESS_PUBLIC_SOURCE_POLICY'
  )
from integration.providers p
cross join (values
  ('BTC/USD','XBTUSD'),
  ('ETH/USD','ETHUSD'),
  ('SOL/USD','SOLUSD'),
  ('LTC/USD','LTCUSD'),
  ('XRP/USD','XRPUSD'),
  ('ADA/USD','ADAUSD')
) as v(canonical_key,external_key)
where p.code='KRAKEN' and p.environment='PRODUCTION' and p.provider_type='ORACLE'
on conflict(provider_id,resource_type,canonical_key) do update set
  external_key=excluded.external_key,
  status='ACTIVE',
  metadata=excluded.metadata,
  updated_at=statement_timestamp();

-- Seed a new reviewable version; never rewrite an already approved Oracle policy.
insert into oracle.policies (
  public_id,name,capability_id,version,source_hierarchy,consensus_rule,
  close_rule,postponement_rule,cancellation_rule,void_rule,
  dispute_window_seconds,status,effective_at,created_by,approved_by
)
select
  gen_random_uuid(),current_policy.name,current_policy.capability_id,
  (select coalesce(max(existing.version),0)+1
   from oracle.policies existing where existing.name=current_policy.name),
  jsonb_build_array(
    jsonb_build_object('role','PRIMARY','provider_code','COINBASE','priority',10),
    jsonb_build_object('role','CORROBORATING','provider_code','KRAKEN','priority',20)
  ),
  coalesce(current_policy.consensus_rule,'{}'::jsonb) || jsonb_build_object(
    'finalization_mode','AUTO_AFTER_DISPUTE_WINDOW',
    'distinct_providers',true,
    'min_agreeing_providers',2
  ),
  current_policy.close_rule,current_policy.postponement_rule,
  current_policy.cancellation_rule,current_policy.void_rule,
  current_policy.dispute_window_seconds,'DRAFT',statement_timestamp(),null,null
from oracle.policies current_policy
where current_policy.name in ('VAD Crypto Threshold Launch Policy','VAD Sandbox Crypto Threshold Policy')
  and current_policy.status='ACTIVE'
  and current_policy.approved_by is not null
  and not exists (
    select 1 from oracle.policies existing_draft
    where existing_draft.name=current_policy.name
      and existing_draft.status='DRAFT'
      and existing_draft.source_hierarchy @> '[{"role":"PRIMARY","provider_code":"COINBASE","priority":10},{"role":"CORROBORATING","provider_code":"KRAKEN","priority":20}]'::jsonb
  );

-- Replace the old market-creation function's paid-provider assumptions without
-- changing its signature, permission checks, proposal workflow, or publish guard.
do $migration$
declare
  v_definition text;
  v_start integer;
  v_end integer;
  v_old text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='admin_create_crypto_threshold_market'
  order by p.oid limit 1;

  if v_definition is null then
    raise exception 'admin_create_crypto_threshold_market function was not found';
  end if;

  v_start:=strpos(v_definition,'  -- A market may only use a crypto pair after an exact Pyth feed and the');
  v_end:=strpos(v_definition,'  v_result:=public.admin_create_catalog_market_v2(');
  if v_start=0 or v_end<=v_start then
    raise exception 'Could not safely locate old Oracle source prechecks in market creation function';
  end if;
  v_definition:=substring(v_definition from 1 for v_start-1) ||
  $new$
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

$new$ || substring(v_definition from v_end);

  v_start:=strpos(v_definition,'  select p.id into v_policy_id');
  v_end:=strpos(v_definition,'  update oracle.event_policy_bindings');
  if v_start=0 or v_end<=v_start then
    raise exception 'Could not safely locate Oracle policy binding in market creation function';
  end if;
  v_definition:=substring(v_definition from 1 for v_start-1) ||
  $new$
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
    and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h where upper(coalesce(h->>'provider_code',''))='COINBASE')
    and exists(select 1 from jsonb_array_elements(p.source_hierarchy) h where upper(coalesce(h->>'provider_code',''))='KRAKEN')
  order by p.effective_at desc,p.version desc limit 1;
  if v_policy_id is null then
    raise exception 'The Coinbase/Kraken policy is not approved yet. An Oracle reviewer must approve the latest free-source policy before automatic threshold markets can be created.' using errcode='P0001';
  end if;

$new$ || substring(v_definition from v_end);

  v_start:=strpos(v_definition,'  insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)');
  v_end:=strpos(v_definition,'  perform command.refresh_market_catalog(v_instrument.id);');
  if v_start=0 or v_end<=v_start then
    raise exception 'Could not safely locate provider resource binding in market creation function';
  end if;
  v_definition:=substring(v_definition from 1 for v_start-1) ||
  $new$
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

$new$ || substring(v_definition from v_end);

  v_definition:=replace(
    v_definition,
    'Resolution uses approved historical Pyth and CoinGecko observations in the configured observation window. Live display quotes do not determine outcomes.',
    'Resolution uses approved public historical Coinbase and Kraken observations in the configured observation window. Live display quotes do not determine outcomes.'
  );
  v_definition:=replace(v_definition,
    'jsonb_build_array(''PYTH'',''COINGECKO'')',
    'jsonb_build_array(''COINBASE'',''KRAKEN'')'
  );
  v_definition:=replace(v_definition,
    'using approved historical Oracle providers',
    'using approved keyless public historical Oracle providers'
  );
  v_definition:=replace(v_definition,
    'and p.code in (''PYTH'',''COINGECKO'')',
    'and p.code in (''COINBASE'',''KRAKEN'')'
  );

  execute v_definition;
end
$migration$;

commit;
