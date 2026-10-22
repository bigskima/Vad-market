begin;

-- Keep provider resource administration aligned with the provider-neutral resolver registry.
create or replace function public.admin_upsert_oracle_provider_resource(
  p_provider_code text,
  p_environment text,
  p_resource_type text,
  p_canonical_key text,
  p_external_key text,
  p_status text default 'ACTIVE',
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
declare
  provider_id bigint;
  resource_id bigint;
  resource_type text:=upper(trim(coalesce(p_resource_type,'')));
  resource_status text:=upper(trim(coalesce(p_status,'ACTIVE')));
  canonical_key text:=btrim(coalesce(p_canonical_key,''));
  external_key text:=btrim(coalesce(p_external_key,''));
begin
  if not private.has_permission('providers.manage') then
    raise exception 'Permission required' using errcode='42501';
  end if;
  if resource_type not in ('CRYPTO_PAIR','CANONICAL_EVENT','SPORTS_COMPETITION','PUBLIC_EVENT','FINANCIAL_SYMBOL','FRED_SERIES') then
    raise exception 'Invalid oracle resource type' using errcode='22023';
  end if;
  if resource_status not in ('ACTIVE','DISABLED') then
    raise exception 'Invalid oracle resource status' using errcode='22023';
  end if;
  if char_length(canonical_key) not between 1 and 180
     or char_length(external_key) not between 1 and 300
     or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then
    raise exception 'Invalid resource key or metadata' using errcode='22023';
  end if;
  select id into provider_id
  from integration.providers
  where code=upper(trim(p_provider_code))
    and environment=upper(trim(p_environment))
    and provider_type='ORACLE';
  if provider_id is null then
    raise exception 'Oracle provider not found' using errcode='P0002';
  end if;
  insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
  values(provider_id,resource_type,canonical_key,external_key,resource_status,coalesce(p_metadata,'{}'::jsonb))
  on conflict(provider_id,resource_type,canonical_key) do update set
    external_key=excluded.external_key,
    status=excluded.status,
    metadata=excluded.metadata,
    updated_at=statement_timestamp()
  returning id into resource_id;
  return resource_id;
end;
$function$;
revoke all on function public.admin_upsert_oracle_provider_resource(text,text,text,text,text,text,jsonb) from public,anon;
grant execute on function public.admin_upsert_oracle_provider_resource(text,text,text,text,text,text,jsonb) to authenticated;

-- Scope validation is deterministic and data-driven. An automatic publication gate
-- requires two configured, healthy and independently mapped providers; runtime
-- finalization remains stricter and still rejects any provider disagreement.
create or replace function private.validate_oracle_resolution_scope(
  p_scope jsonb,
  p_closes_at timestamptz default null,
  p_resolves_after timestamptz default null
)
returns jsonb
language plpgsql
stable
set search_path=''
as $function$
declare
  resolver_type text;
  asset_code text;
  symbol_code text;
  series_code text;
  quote_code text;
  operator_code text;
  condition_code text;
  threshold_value numeric;
  observation_at timestamptz;
  window_start timestamptz;
  window_end timestamptz;
  series_date date;
  vintage_date date;
  ready_provider_count integer:=0;
  mapped_provider_count integer:=0;
begin
  if p_scope is null or jsonb_typeof(p_scope)<>'object' then
    return jsonb_build_object('valid',false,'autoPublishReady',false,'reason','Resolution scope must be an object.','riskFlag','RESOLUTION_SCOPE_INVALID');
  end if;
  if private.resolution_scope_has_forbidden_keys(p_scope) then
    return jsonb_build_object('valid',false,'autoPublishReady',false,'reason','Resolution scope contains provider-specific identifiers. Provider IDs, feed IDs, match IDs, endpoints and credentials are backend-owned.','riskFlag','AI_PROVIDER_IDENTIFIER_FORBIDDEN');
  end if;

  resolver_type:=upper(btrim(coalesce(p_scope->>'resolver_type',p_scope->>'resolverType','')));
  if resolver_type='' then
    return jsonb_build_object('valid',false,'autoPublishReady',false,'reason','A deterministic resolver_type is required.','riskFlag','RESOLVER_TYPE_REQUIRED');
  end if;

  if resolver_type in ('CRYPTO_PRICE_THRESHOLD_V1','CRYPTO_PRICE_TOUCH_THRESHOLD_V1','FINANCIAL_PRICE_THRESHOLD_V1') then
    asset_code:=upper(btrim(coalesce(p_scope->>'asset',p_scope#>>'{subject,asset}',p_scope->>'symbol',p_scope#>>'{subject,symbol}',p_scope->>'crypto_asset_symbol','')));
    quote_code:=upper(btrim(coalesce(p_scope->>'quote',p_scope#>>'{subject,quote}','USD')));
    operator_code:=upper(btrim(coalesce(p_scope->>'operator',p_scope#>>'{condition,operator}','')));
    begin
      threshold_value:=coalesce(nullif(p_scope->>'threshold','')::numeric,nullif(p_scope#>>'{condition,threshold}','')::numeric);
    exception when invalid_text_representation or numeric_value_out_of_range then
      threshold_value:=null;
    end;
    if asset_code like '%/%' then
      quote_code:=coalesce(nullif(split_part(asset_code,'/',2),''),quote_code);
      asset_code:=split_part(asset_code,'/',1);
    end if;
    if asset_code !~ '^[A-Z0-9._-]{1,40}$' or quote_code !~ '^[A-Z0-9]{2,12}$' then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','A valid financial asset symbol and quote currency are required.','riskFlag','FINANCIAL_SYMBOL_INVALID');
    end if;
    if operator_code not in ('GT','GTE','LT','LTE') then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','Threshold operator must be GT, GTE, LT or LTE.','riskFlag','FINANCIAL_OPERATOR_INVALID');
    end if;
    if threshold_value is null or (resolver_type<>'FRED_SERIES_THRESHOLD_V1' and threshold_value<=0) then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','A valid numeric threshold is required.','riskFlag','FINANCIAL_THRESHOLD_INVALID');
    end if;

    if resolver_type='CRYPTO_PRICE_THRESHOLD_V1' then
      observation_at:=private.try_timestamptz(coalesce(nullif(p_scope->>'observation_time',''),nullif(p_scope->>'observationTime',''),nullif(p_scope#>>'{condition,observation_time}',''),nullif(p_scope#>>'{condition,observationTime}','')));
      if observation_at is null then
        return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','Crypto threshold rules require an explicit observation_time.','riskFlag','OBSERVATION_TIME_REQUIRED');
      end if;
      if p_closes_at is not null and observation_at<p_closes_at then
        return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','The oracle observation time cannot be earlier than market close.','riskFlag','RESOLUTION_TIMING_INVALID');
      end if;
      if p_resolves_after is not null and p_resolves_after<observation_at then
        return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','resolvesAfter cannot be earlier than the oracle observation time.','riskFlag','RESOLUTION_TIMING_INVALID');
      end if;
      select count(distinct r.provider_id)::integer into mapped_provider_count
      from oracle.provider_resources r
      join integration.providers p on p.id=r.provider_id
      where r.resource_type in ('CRYPTO_PAIR','FINANCIAL_SYMBOL')
        and upper(r.canonical_key)=asset_code||'/'||quote_code
        and r.status='ACTIVE' and p.provider_type='ORACLE' and p.environment='PRODUCTION'
        and p.capabilities @> '["CRYPTO_PRICE_THRESHOLD"]'::jsonb
        and coalesce((r.metadata->>'settlement_eligible')::boolean,false)=true;
      select count(distinct r.provider_id)::integer into ready_provider_count
      from oracle.provider_resources r
      join integration.providers p on p.id=r.provider_id
      left join integration.provider_health h on h.provider_id=p.id
      where r.resource_type in ('CRYPTO_PAIR','FINANCIAL_SYMBOL')
        and upper(r.canonical_key)=asset_code||'/'||quote_code and r.status='ACTIVE'
        and p.provider_type='ORACLE' and p.environment='PRODUCTION' and p.status in ('ACTIVE','DEGRADED')
        and p.capabilities @> '["CRYPTO_PRICE_THRESHOLD"]'::jsonb
        and coalesce((p.public_metadata->>'configured')::boolean,false)=true
        and coalesce(h.status,'UNKNOWN')<>'UNAVAILABLE'
        and coalesce((r.metadata->>'settlement_eligible')::boolean,false)=true;
    elsif resolver_type='CRYPTO_PRICE_TOUCH_THRESHOLD_V1' then
      window_start:=private.try_timestamptz(coalesce(nullif(p_scope->>'window_start',''),nullif(p_scope->>'windowStart',''),nullif(p_scope->>'period_start','')));
      window_end:=private.try_timestamptz(coalesce(nullif(p_scope->>'window_end',''),nullif(p_scope->>'windowEnd',''),nullif(p_scope->>'observation_time',''),nullif(p_scope->>'observationTime',''),p_closes_at::text));
      if window_end is not null and window_start is null then
        window_start:=date_trunc('day',window_end at time zone 'UTC') at time zone 'UTC';
      end if;
      if window_start is null or window_end is null or window_end<=window_start
         or (p_closes_at is not null and window_end<p_closes_at)
         or (p_resolves_after is not null and p_resolves_after<window_end) then
        return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','Threshold-touch rules require a valid historical window ending at or after market close and before resolvesAfter.','riskFlag','RESOLUTION_TIMING_INVALID');
      end if;
      select count(distinct r.provider_id)::integer into mapped_provider_count
      from oracle.provider_resources r
      join integration.providers p on p.id=r.provider_id
      where p.code in ('COINGECKO','TWELVE_DATA')
        and r.resource_type in ('CRYPTO_PAIR','FINANCIAL_SYMBOL')
        and upper(r.canonical_key)=asset_code||'/'||quote_code
        and r.status='ACTIVE' and p.provider_type='ORACLE' and p.environment='PRODUCTION'
        and p.capabilities @> '["CRYPTO_PRICE_THRESHOLD"]'::jsonb
        and coalesce((r.metadata->>'settlement_eligible')::boolean,false)=true;
      select count(distinct r.provider_id)::integer into ready_provider_count
      from oracle.provider_resources r
      join integration.providers p on p.id=r.provider_id
      left join integration.provider_health h on h.provider_id=p.id
      where p.code in ('COINGECKO','TWELVE_DATA')
        and r.resource_type in ('CRYPTO_PAIR','FINANCIAL_SYMBOL')
        and upper(r.canonical_key)=asset_code||'/'||quote_code and r.status='ACTIVE'
        and p.provider_type='ORACLE' and p.environment='PRODUCTION' and p.status in ('ACTIVE','DEGRADED')
        and p.capabilities @> '["CRYPTO_PRICE_THRESHOLD"]'::jsonb
        and coalesce((p.public_metadata->>'configured')::boolean,false)=true
        and coalesce(h.status,'UNKNOWN')<>'UNAVAILABLE'
        and coalesce((r.metadata->>'settlement_eligible')::boolean,false)=true;
    else
      observation_at:=private.try_timestamptz(coalesce(nullif(p_scope->>'observation_time',''),nullif(p_scope->>'observationTime',''),p_resolves_after::text));
      if observation_at is null or (p_closes_at is not null and observation_at<p_closes_at)
         or (p_resolves_after is not null and p_resolves_after<observation_at) then
        return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','Financial price threshold requires a timestamped observation at or after market close.','riskFlag','RESOLUTION_TIMING_INVALID');
      end if;
      select count(distinct r.provider_id)::integer into mapped_provider_count
      from oracle.provider_resources r join integration.providers p on p.id=r.provider_id
      where r.resource_type='FINANCIAL_SYMBOL' and upper(r.canonical_key)=asset_code||'/'||quote_code
        and r.status='ACTIVE' and p.provider_type='ORACLE' and p.environment='PRODUCTION'
        and p.capabilities @> '["FINANCIAL_PRICE_THRESHOLD"]'::jsonb
        and coalesce((r.metadata->>'settlement_eligible')::boolean,false)=true;
      select count(distinct r.provider_id)::integer into ready_provider_count
      from oracle.provider_resources r join integration.providers p on p.id=r.provider_id
      left join integration.provider_health h on h.provider_id=p.id
      where r.resource_type='FINANCIAL_SYMBOL' and upper(r.canonical_key)=asset_code||'/'||quote_code and r.status='ACTIVE'
        and p.provider_type='ORACLE' and p.environment='PRODUCTION' and p.status in ('ACTIVE','DEGRADED')
        and p.capabilities @> '["FINANCIAL_PRICE_THRESHOLD"]'::jsonb
        and coalesce((p.public_metadata->>'configured')::boolean,false)=true
        and coalesce(h.status,'UNKNOWN')<>'UNAVAILABLE'
        and coalesce((r.metadata->>'settlement_eligible')::boolean,false)=true;
    end if;

    return jsonb_build_object(
      'valid',true,
      'autoPublishReady',ready_provider_count>=2,
      'resolverType',resolver_type,
      'canonicalResource',asset_code||'/'||quote_code,
      'requiredIndependentProviders',2,
      'mappedProviderCount',mapped_provider_count,
      'readyProviderCount',ready_provider_count,
      'reason',case when ready_provider_count>=2 then 'Deterministic historical-price contract and two independent providers are ready.' else 'The market can be configured, but it is not eligible for automatic publication until at least two independent, configured providers have active resource mappings.' end,
      'riskFlag',case when ready_provider_count>=2 then null else 'ORACLE_QUORUM_NOT_READY' end
    );
  end if;

  if resolver_type='FRED_SERIES_THRESHOLD_V1' then
    series_code:=upper(btrim(coalesce(p_scope->>'series_id',p_scope->>'seriesId',p_scope#>>'{subject,series_id}',p_scope#>>'{subject,seriesId}','')));
    operator_code:=upper(btrim(coalesce(p_scope->>'operator',p_scope#>>'{condition,operator}','')));
    begin
      threshold_value:=coalesce(nullif(p_scope->>'threshold','')::numeric,nullif(p_scope#>>'{condition,threshold}','')::numeric);
      series_date:=nullif(left(coalesce(p_scope->>'observation_date',p_scope->>'observationDate',p_scope->>'record_date',p_scope->>'recordDate',p_resolves_after::text,''),10),'')::date;
      vintage_date:=nullif(left(coalesce(p_scope->>'vintage_date',p_scope->>'vintageDate',''),10),'')::date;
    exception when invalid_text_representation or numeric_value_out_of_range then
      threshold_value:=null;
      series_date:=null;
      vintage_date:=null;
    end;
    if series_code !~ '^[A-Z0-9_-]{1,40}$' or operator_code not in ('GT','GTE','LT','LTE') or threshold_value is null or series_date is null then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','FRED rules require a valid series ID, numeric operator/threshold and observation date.','riskFlag','FRED_SCOPE_INVALID');
    end if;
    select count(distinct r.provider_id)::integer into mapped_provider_count
    from oracle.provider_resources r join integration.providers p on p.id=r.provider_id
    where r.resource_type='FRED_SERIES' and upper(r.canonical_key)=series_code
      and r.status='ACTIVE' and p.provider_type='ORACLE' and p.environment='PRODUCTION'
      and p.capabilities @> '["FRED_SERIES_THRESHOLD"]'::jsonb;
    select count(distinct r.provider_id)::integer into ready_provider_count
    from oracle.provider_resources r join integration.providers p on p.id=r.provider_id
    left join integration.provider_health h on h.provider_id=p.id
    where r.resource_type='FRED_SERIES' and upper(r.canonical_key)=series_code and r.status='ACTIVE'
      and p.provider_type='ORACLE' and p.environment='PRODUCTION' and p.status in ('ACTIVE','DEGRADED')
      and p.capabilities @> '["FRED_SERIES_THRESHOLD"]'::jsonb
      and coalesce((p.public_metadata->>'configured')::boolean,false)=true
      and coalesce(h.status,'UNKNOWN')<>'UNAVAILABLE';
    return jsonb_build_object(
      'valid',true,'autoPublishReady',ready_provider_count>=2,'resolverType',resolver_type,
      'canonicalResource',series_code,'observationDate',series_date,'vintageDate',vintage_date,
      'requiredIndependentProviders',2,'mappedProviderCount',mapped_provider_count,'readyProviderCount',ready_provider_count,
      'reason',case when ready_provider_count>=2 then 'The dated economic series is mapped to two configured providers.' else 'The rule is valid but automatic publication waits for two configured series providers.' end,
      'riskFlag',case when ready_provider_count>=2 then null else 'ORACLE_QUORUM_NOT_READY' end
    );
  end if;

  if resolver_type='FOOTBALL_MATCH_RESULT_V1' then
    condition_code:=upper(btrim(coalesce(case when jsonb_typeof(p_scope->'condition')='string' then p_scope->>'condition' else null end,p_scope#>>'{condition,value}',p_scope#>>'{condition,result}',p_scope->>'result','')));
    if condition_code not in ('HOME_WIN','AWAY_WIN','DRAW') then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','Football resolver condition must be HOME_WIN, AWAY_WIN or DRAW.','riskFlag','FOOTBALL_CONDITION_INVALID');
    end if;
    return jsonb_build_object('valid',true,'autoPublishReady',false,'resolverType',resolver_type,'requiredIndependentProviders',2,'reason','The rule is deterministic. Automatic publishing requires two independently mapped final-result feeds for the exact fixture.','riskFlag','FOOTBALL_SOURCE_BINDING_REQUIRED');
  end if;

  if resolver_type='PUBLIC_RECORD_RULE_V1' then
    operator_code:=upper(btrim(coalesce(p_scope#>>'{rule,operator}',p_scope->>'operator','')));
    condition_code:=btrim(coalesce(p_scope#>>'{rule,expected}',p_scope->>'expected',''));
    if operator_code not in ('BEFORE_OR_AT','AFTER','EQUALS','CONTAINS','EXISTS','GT','GTE','LT','LTE') then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','Public-record rule requires a supported deterministic operator.','riskFlag','PUBLIC_RECORD_OPERATOR_INVALID');
    end if;
    if operator_code in ('EQUALS','CONTAINS','GT','GTE','LT','LTE') and condition_code='' then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','Public-record rule requires an expected value or numeric threshold.','riskFlag','PUBLIC_RECORD_EXPECTED_VALUE_REQUIRED');
    end if;
    return jsonb_build_object('valid',true,'autoPublishReady',false,'resolverType',resolver_type,'requiredIndependentProviders',2,'reason','The rule is deterministic. Automatic publication remains pending until the official authority and independent evidence route are bound for this event.','riskFlag','PUBLIC_RECORD_SOURCE_BINDING_REQUIRED');
  end if;

  return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','This resolver type is not eligible for deterministic automated resolution.','riskFlag','RESOLVER_NOT_AUTOMATED');
end;
$function$;

commit;
