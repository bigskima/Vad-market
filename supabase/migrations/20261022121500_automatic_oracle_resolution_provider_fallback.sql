begin;

-- Expand the provider-owned canonical resource registry without letting client
-- supplied market descriptions inject arbitrary provider IDs or endpoints.
alter table oracle.provider_resources
  drop constraint if exists provider_resources_resource_type_check;
alter table oracle.provider_resources
  add constraint provider_resources_resource_type_check
  check (resource_type in (
    'CRYPTO_PAIR','CANONICAL_EVENT','SPORTS_COMPETITION','PUBLIC_EVENT',
    'FINANCIAL_SYMBOL','FRED_SERIES'
  ));

-- Register the providers used by deterministic resolvers. Secrets are references
-- to Edge Function secrets; the key material itself is never stored in PostgreSQL.
insert into integration.providers as current_provider
  (code,name,provider_type,environment,status,priority,capabilities,public_metadata,secret_reference)
values
  ('TWELVE_DATA','Twelve Data Historical Market Data','ORACLE','PRODUCTION','ACTIVE',30,
   '["CRYPTO_PRICE_THRESHOLD","FINANCIAL_PRICE_THRESHOLD"]'::jsonb,
   '{"configured":false,"adapter":"TWELVE_DATA_HISTORICAL_V1","base_url":"https://api.twelvedata.com","health_probe":"CREDENTIAL_ONLY","settlement_role":"HISTORICAL_PRICE_CORROBORATION"}'::jsonb,
   'TWELVE_DATA_API_KEY'),
  ('FRED','Federal Reserve Economic Data','ORACLE','PRODUCTION','ACTIVE',40,
   '["FRED_SERIES_THRESHOLD"]'::jsonb,
   '{"configured":false,"adapter":"FRED_SERIES_V1","base_url":"https://api.stlouisfed.org/fred","health_probe":"CREDENTIAL_ONLY","settlement_role":"OFFICIAL_MACROECONOMIC_SOURCE"}'::jsonb,
   'FRED_API_KEY'),
  ('ALPHA_VANTAGE','Alpha Vantage Historical Data','ORACLE','PRODUCTION','ACTIVE',50,
   '["FINANCIAL_PRICE_THRESHOLD","FRED_SERIES_THRESHOLD"]'::jsonb,
   '{"configured":false,"adapter":"ALPHA_VANTAGE_SERIES_V1","base_url":"https://www.alphavantage.co","health_probe":"CREDENTIAL_ONLY","settlement_role":"SECONDARY_FINANCIAL_CORROBORATION"}'::jsonb,
   'ALPHA_VANTAGE_API_KEY')
on conflict(code,environment) do update set
  name=excluded.name,
  status='ACTIVE',
  priority=excluded.priority,
  capabilities=excluded.capabilities,
  public_metadata=current_provider.public_metadata || excluded.public_metadata,
  secret_reference=excluded.secret_reference,
  updated_at=statement_timestamp();

-- Enable provider adapters that can supply corroborating sports results. Fixture
-- IDs remain event-specific provider-resource mappings, never guessed from titles.
update integration.providers p
set priority=80,
    capabilities=case when p.capabilities ? 'FOOTBALL_MATCH_RESULT'
      then p.capabilities else p.capabilities || '["FOOTBALL_MATCH_RESULT"]'::jsonb end,
    public_metadata=p.public_metadata || jsonb_build_object(
      'adapter','THESPORTSDB_V1',
      'base_url','https://www.thesportsdb.com/api/v1/json/123',
      'settlement_role','SECONDARY_SPORTS_RESULT',
      'health_probe','CREDENTIAL_ONLY'
    ),
    updated_at=statement_timestamp()
where p.code='THESPORTSDB' and p.environment='PRODUCTION' and p.provider_type='ORACLE';

update integration.providers p
set priority=60,
    capabilities=case when p.capabilities ? 'FOOTBALL_MATCH_RESULT'
      then p.capabilities else p.capabilities || '["FOOTBALL_MATCH_RESULT"]'::jsonb end,
    public_metadata=p.public_metadata || jsonb_build_object(
      'adapter','API_SPORTS_FOOTBALL_V3',
      'base_url','https://v3.football.api-sports.io',
      'settlement_role','SECONDARY_SPORTS_RESULT',
      'health_probe','CREDENTIAL_ONLY'
    ),
    updated_at=statement_timestamp()
where p.code='API_SPORTS' and p.environment='PRODUCTION' and p.provider_type='ORACLE';

update integration.providers p
set priority=15,
    capabilities=case when p.capabilities ? 'PUBLIC_RECORD_EVIDENCE'
      then p.capabilities else p.capabilities || '["PUBLIC_RECORD_EVIDENCE"]'::jsonb end,
    public_metadata=p.public_metadata || jsonb_build_object(
      'adapter','US_SENATE_FLOOR_V1',
      'base_url','https://www.senate.gov',
      'health_probe','CREDENTIAL_ONLY'
    ),
    updated_at=statement_timestamp()
where p.code='US_SENATE' and p.environment='PRODUCTION' and p.provider_type='ORACLE';

-- Explicit mappings are required before a provider's answer can count toward a
-- settlement quorum. Mapping presence alone does not assert that a secret exists.
insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'FINANCIAL_SYMBOL',v.canonical_key,v.external_key,'ACTIVE',v.metadata::jsonb
from integration.providers p
join (values
  ('BTC/USD','BTC/USD','{"settlement_eligible":true,"interval":"1min","max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"CRYPTO"}'),
  ('ETH/USD','ETH/USD','{"settlement_eligible":true,"interval":"1min","max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"CRYPTO"}'),
  ('SOL/USD','SOL/USD','{"settlement_eligible":true,"interval":"1min","max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"CRYPTO"}'),
  ('XRP/USD','XRP/USD','{"settlement_eligible":true,"interval":"1min","max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"CRYPTO"}'),
  ('AAPL/USD','AAPL','{"settlement_eligible":true,"interval":"1min","max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"STOCKS","alpha_vantage_function":"TIME_SERIES_INTRADAY"}'),
  ('MSFT/USD','MSFT','{"settlement_eligible":true,"interval":"1min","max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"STOCKS","alpha_vantage_function":"TIME_SERIES_INTRADAY"}'),
  ('NVDA/USD','NVDA','{"settlement_eligible":true,"interval":"1min","max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"STOCKS","alpha_vantage_function":"TIME_SERIES_INTRADAY"}'),
  ('EUR/USD','EUR/USD','{"settlement_eligible":true,"interval":"1min","max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"FOREX","alpha_vantage_function":"FX_INTRADAY"}'),
  ('GBP/USD','GBP/USD','{"settlement_eligible":true,"interval":"1min","max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"FOREX","alpha_vantage_function":"FX_INTRADAY"}'),
  ('USD/JPY','USD/JPY','{"settlement_eligible":true,"interval":"1min","max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"FOREX","alpha_vantage_function":"FX_INTRADAY"}'),
  ('XAU/USD','XAU/USD','{"settlement_eligible":true,"interval":"1min","max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"COMMODITIES"}'),
  ('WTI/USD','WTI/USD','{"settlement_eligible":true,"interval":"1min","max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"COMMODITIES"}'),
  ('BRENT/USD','BRENT/USD','{"settlement_eligible":true,"interval":"1min","max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"COMMODITIES"}')
) as v(canonical_key,external_key,metadata) on true
where p.code='TWELVE_DATA' and p.environment='PRODUCTION'
on conflict(provider_id,resource_type,canonical_key) do update set
  external_key=excluded.external_key,
  status='ACTIVE',
  metadata=oracle.provider_resources.metadata || excluded.metadata,
  updated_at=statement_timestamp();

insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'FINANCIAL_SYMBOL',v.canonical_key,v.external_key,'ACTIVE',v.metadata::jsonb
from integration.providers p
join (values
  ('AAPL/USD','AAPL','{"settlement_eligible":true,"alpha_vantage_function":"TIME_SERIES_INTRADAY","interval":"1min","max_timestamp_delta_seconds":600,"asset_class":"STOCKS"}'),
  ('MSFT/USD','MSFT','{"settlement_eligible":true,"alpha_vantage_function":"TIME_SERIES_INTRADAY","interval":"1min","max_timestamp_delta_seconds":600,"asset_class":"STOCKS"}'),
  ('NVDA/USD','NVDA','{"settlement_eligible":true,"alpha_vantage_function":"TIME_SERIES_INTRADAY","interval":"1min","max_timestamp_delta_seconds":600,"asset_class":"STOCKS"}'),
  ('EUR/USD','EUR/USD','{"settlement_eligible":true,"alpha_vantage_function":"FX_INTRADAY","interval":"1min","max_timestamp_delta_seconds":600,"asset_class":"FOREX"}'),
  ('GBP/USD','GBP/USD','{"settlement_eligible":true,"alpha_vantage_function":"FX_INTRADAY","interval":"1min","max_timestamp_delta_seconds":600,"asset_class":"FOREX"}'),
  ('USD/JPY','USD/JPY','{"settlement_eligible":true,"alpha_vantage_function":"FX_INTRADAY","interval":"1min","max_timestamp_delta_seconds":600,"asset_class":"FOREX"}')
) as v(canonical_key,external_key,metadata) on true
where p.code='ALPHA_VANTAGE' and p.environment='PRODUCTION'
on conflict(provider_id,resource_type,canonical_key) do update set
  external_key=excluded.external_key,
  status='ACTIVE',
  metadata=oracle.provider_resources.metadata || excluded.metadata,
  updated_at=statement_timestamp();

insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'FRED_SERIES',v.series_id,v.series_id,'ACTIVE',v.metadata::jsonb
from integration.providers p
join (values
  ('CPIAUCSL','{"title":"Consumer Price Index for All Urban Consumers","units":"Index 1982-1984=100"}'),
  ('UNRATE','{"title":"Unemployment Rate","units":"Percent"}'),
  ('GDP','{"title":"Gross Domestic Product","units":"Billions of Dollars"}'),
  ('FEDFUNDS','{"title":"Federal Funds Effective Rate","units":"Percent"}'),
  ('DGS10','{"title":"10-Year Treasury Constant Maturity Rate","units":"Percent"}'),
  ('DFF','{"title":"Effective Federal Funds Rate","units":"Percent"}')
) as v(series_id,metadata) on true
where p.code='FRED' and p.environment='PRODUCTION'
on conflict(provider_id,resource_type,canonical_key) do update set
  external_key=excluded.external_key,
  status='ACTIVE',
  metadata=oracle.provider_resources.metadata || excluded.metadata,
  updated_at=statement_timestamp();

insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'FRED_SERIES',v.series_id,v.series_id,'ACTIVE',v.metadata::jsonb
from integration.providers p
join (values
  ('CPIAUCSL','{"title":"Consumer Price Index for All Urban Consumers","units":"Index 1982-1984=100","alpha_vantage_function":"CPI"}'),
  ('UNRATE','{"title":"Unemployment Rate","units":"Percent","alpha_vantage_function":"UNEMPLOYMENT"}'),
  ('GDP','{"title":"Gross Domestic Product","units":"Billions of Dollars","alpha_vantage_function":"REAL_GDP"}'),
  ('FEDFUNDS','{"title":"Federal Funds Effective Rate","units":"Percent","alpha_vantage_function":"FEDERAL_FUNDS_RATE"}'),
  ('DGS10','{"title":"10-Year Treasury Constant Maturity Rate","units":"Percent","alpha_vantage_function":"TREASURY_YIELD"}'),
  ('DFF','{"title":"Effective Federal Funds Rate","units":"Percent","alpha_vantage_function":"FEDERAL_FUNDS_RATE"}')
) as v(series_id,metadata) on true
where p.code='ALPHA_VANTAGE' and p.environment='PRODUCTION'
on conflict(provider_id,resource_type,canonical_key) do update set
  external_key=excluded.external_key,
  status='ACTIVE',
  metadata=oracle.provider_resources.metadata || excluded.metadata,
  updated_at=statement_timestamp();

-- Source priority is explicit, but a provider being listed does not bypass resource,
-- credentials, timestamp, dispute, consensus or finalizer checks.
update oracle.policies
set source_hierarchy=jsonb_build_array(
      jsonb_build_object('role','PRIMARY','provider_code','PYTH','priority',10),
      jsonb_build_object('role','CORROBORATING','provider_code','COINGECKO','priority',20),
      jsonb_build_object('role','FALLBACK','provider_code','TWELVE_DATA','priority',30)
    ),
    consensus_rule=consensus_rule || '{"finalization_mode":"AUTO_AFTER_DISPUTE_WINDOW","distinct_providers":true,"min_agreeing_providers":2}'::jsonb
where name in ('VAD Crypto Threshold Launch Policy','VAD Sandbox Crypto Threshold Policy')
  and status='ACTIVE' and approved_by is not null;

update oracle.policies
set source_hierarchy=jsonb_build_array(
      jsonb_build_object('role','PRIMARY','provider_code','FOOTBALL_DATA','priority',10),
      jsonb_build_object('role','CORROBORATING','provider_code','THESPORTSDB','priority',20),
      jsonb_build_object('role','FALLBACK','provider_code','API_SPORTS','priority',30)
    ),
    consensus_rule=consensus_rule || '{"finalization_mode":"AUTO_AFTER_DISPUTE_WINDOW","distinct_providers":true,"min_agreeing_providers":2}'::jsonb
where name='VAD Football Match Result Test Policy'
  and status='ACTIVE' and approved_by is not null;

update oracle.policies
set source_hierarchy=jsonb_build_array(
      jsonb_build_object('role','PRIMARY','provider_code','US_SENATE','priority',10),
      jsonb_build_object('role','CORROBORATING','provider_code','PUBLIC_RECORD','priority',20),
      jsonb_build_object('role','FALLBACK','provider_code','TAVILY','priority',30)
    ),
    consensus_rule=consensus_rule || '{"finalization_mode":"AUTO_AFTER_DISPUTE_WINDOW","distinct_providers":true,"min_agreeing_providers":2}'::jsonb
where name='VAD Automatic Official Public Record Policy'
  and status='ACTIVE' and approved_by is not null;

update oracle.policies
set source_hierarchy=jsonb_build_array(
      jsonb_build_object('role','PRIMARY','provider_code','PUBLIC_RECORD','priority',10),
      jsonb_build_object('role','CORROBORATING','provider_code','TAVILY','priority',20)
    ),
    consensus_rule=consensus_rule || '{"finalization_mode":"AUTO_AFTER_DISPUTE_WINDOW","distinct_providers":true,"min_agreeing_providers":2}'::jsonb
where name in ('VAD Verified Public Event Test Policy','VAD Generic Public Record Policy','VAD Generic Evidence Gateway Policy')
  and status='ACTIVE' and approved_by is not null;

-- Convert legacy BTC "by date" questions to an objective historical threshold-touch
-- contract. Only the exact legacy shape is upgraded. Any old human-entered provisional
-- resolution is retained as CONFLICT for audit, never silently finalised.
with legacy as (
  select e.id,e.closes_at,
         regexp_match(e.title,'reach or exceed \$([0-9,]+) by') as parts
  from market.canonical_events e
  where e.category='CRYPTO_WEB3'
    and e.title ~* '^Will BTC/USD reach or exceed \$[0-9,]+ by '
    and e.status in ('AWAITING_ORACLE','PROVISIONALLY_RESOLVED')
    and upper(coalesce(e.resolution_scope->>'resolver_type',''))='VAD_REVIEW_V1'
)
update market.canonical_events e
set resolution_scope=(e.resolution_scope - 'resolver_type' - 'asset' - 'quote' - 'operator' - 'threshold' - 'window_start' - 'window_end')
  || jsonb_build_object(
      'resolver_type','CRYPTO_PRICE_TOUCH_THRESHOLD_V1',
      'asset','BTC',
      'quote','USD',
      'operator','GTE',
      'threshold',replace(legacy.parts[1],',','')::numeric,
      'window_start',date_trunc('day',legacy.closes_at at time zone 'UTC') at time zone 'UTC',
      'window_end',legacy.closes_at,
      'condition','YES when BTC/USD reached or exceeded the configured threshold during the UTC market-date window.',
      'verification','Independent historical price samples must cover the target window or explicitly prove the threshold touch.'
    ),
    updated_at=statement_timestamp()
from legacy
where e.id=legacy.id and legacy.parts is not null;

update oracle.event_policy_bindings b
set oracle_policy_id=(
      select p.id
      from oracle.policies p
      where p.name='VAD Sandbox Crypto Threshold Policy'
        and p.status='ACTIVE'
        and p.approved_by is not null
      order by p.version desc
      limit 1
    ),
    bound_at=statement_timestamp(),
    bound_by=null
from market.canonical_events e
where e.id=b.event_id
  and e.category='CRYPTO_WEB3'
  and e.title ~* '^Will BTC/USD reach or exceed \$[0-9,]+ by '
  and upper(coalesce(e.resolution_scope->>'resolver_type',''))='CRYPTO_PRICE_TOUCH_THRESHOLD_V1'
  and exists(
    select 1 from oracle.policies p
    where p.name='VAD Sandbox Crypto Threshold Policy'
      and p.status='ACTIVE'
      and p.approved_by is not null
  );

with legacy_manual as (
  select r.id,r.event_id
  from oracle.resolutions r
  join market.canonical_events e on e.id=r.event_id
  where e.category='CRYPTO_WEB3'
    and e.title ~* '^Will BTC/USD reach or exceed \$100,000 by October 20, 2026\?$'
    and r.status='PROVISIONAL'
    and r.created_by is not null
    and not exists(
      select 1 from oracle.resolutions other
      where other.event_id=r.event_id and other.status='CONFLICT'
    )
)
update oracle.resolutions r
set status='CONFLICT',
    consensus_evidence=r.consensus_evidence || jsonb_build_object(
      'superseded_by_automatic_oracle',jsonb_build_object(
        'recorded_at',statement_timestamp(),
        'reason','Legacy manual provisional result has no verified provider-quorum evidence; retained as conflict for audit.'
      )
    )
from legacy_manual
where r.id=legacy_manual.id;

update market.canonical_events e
set status='AWAITING_ORACLE',updated_at=statement_timestamp()
where e.category='CRYPTO_WEB3'
  and e.title ~* '^Will BTC/USD reach or exceed \$100,000 by October 20, 2026\?$'
  and e.status='PROVISIONALLY_RESOLVED'
  and upper(coalesce(e.resolution_scope->>'resolver_type',''))='CRYPTO_PRICE_TOUCH_THRESHOLD_V1'
  and exists(select 1 from oracle.resolutions r where r.event_id=e.id and r.status='CONFLICT')
  and not exists(select 1 from oracle.disputes d where d.event_id=e.id and d.status in ('OPEN','UNDER_REVIEW','ESCALATED'));

insert into audit.records(actor_type,action,resource_type,resource_id,reason,metadata)
select 'SYSTEM','LEGACY_MARKET_MOVED_TO_AUTOMATIC_ORACLE','CANONICAL_EVENT',e.public_id::text,
       'Legacy threshold-touch rule upgraded to provider-backed history with a quorum of two.',
       jsonb_build_object('resolver_type',e.resolution_scope->>'resolver_type','policy_id',b.oracle_policy_id,'source','automatic_oracle_resolution_provider_fallback')
from market.canonical_events e
left join oracle.event_policy_bindings b on b.event_id=e.id
where e.category='CRYPTO_WEB3'
  and e.title ~* '^Will BTC/USD reach or exceed \$[0-9,]+ by '
  and upper(coalesce(e.resolution_scope->>'resolver_type',''))='CRYPTO_PRICE_TOUCH_THRESHOLD_V1';

commit;
