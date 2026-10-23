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
  ('TWELVE_DATA','Twelve Data Historical Market Data','ORACLE','PRODUCTION','DISABLED',30,
   '["CRYPTO_PRICE_THRESHOLD","FINANCIAL_PRICE_THRESHOLD"]'::jsonb,
   '{"configured":false,"adapter":"TWELVE_DATA_HISTORICAL_V1","base_url":"https://api.twelvedata.com","health_probe":"CREDENTIAL_ONLY","settlement_role":"HISTORICAL_PRICE_CORROBORATION"}'::jsonb,
   'TWELVE_DATA_API_KEY'),
  ('FRED','Federal Reserve Economic Data','ORACLE','PRODUCTION','DISABLED',40,
   '["FRED_SERIES_THRESHOLD"]'::jsonb,
   '{"configured":false,"adapter":"FRED_SERIES_V1","base_url":"https://api.stlouisfed.org/fred","health_probe":"CREDENTIAL_ONLY","settlement_role":"OFFICIAL_MACROECONOMIC_SOURCE"}'::jsonb,
   'FRED_API_KEY'),
  ('ALPHA_VANTAGE','Alpha Vantage Historical Data','ORACLE','PRODUCTION','DISABLED',50,
   '["FINANCIAL_PRICE_THRESHOLD","FRED_SERIES_THRESHOLD"]'::jsonb,
   '{"configured":false,"adapter":"ALPHA_VANTAGE_SERIES_V1","base_url":"https://www.alphavantage.co","health_probe":"CREDENTIAL_ONLY","settlement_role":"SECONDARY_FINANCIAL_CORROBORATION"}'::jsonb,
   'ALPHA_VANTAGE_API_KEY'),
  ('COINBASE','Coinbase Public Historical Market Data','ORACLE','PRODUCTION','ACTIVE',25,
   '["CRYPTO_PRICE_THRESHOLD","FINANCIAL_PRICE_THRESHOLD"]'::jsonb,
   '{"configured":true,"adapter":"COINBASE_PUBLIC_CANDLES_V1","base_url":"https://api.coinbase.com","health_probe":"PUBLIC_MARKET_DATA","settlement_role":"KEYLESS_HISTORICAL_PRICE_CORROBORATION","notes":"Public Coinbase spot candles; no API key required."}'::jsonb,
   null)
on conflict(code,environment) do update set
  name=excluded.name,
  priority=excluded.priority,
  capabilities=excluded.capabilities,
  public_metadata=(current_provider.public_metadata || excluded.public_metadata)
    || jsonb_build_object('configured',coalesce(
      (current_provider.public_metadata->>'configured')::boolean,
      (excluded.public_metadata->>'configured')::boolean,
      false
    )),
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

-- Coinbase public historical candles need no account or API key. Keep the
-- supported USD spot pairs explicit so the resolver never substitutes USDT for USD.
insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'CRYPTO_PAIR',v.canonical_key,v.external_key,'ACTIVE',v.metadata::jsonb
from integration.providers p
join (values
  ('BTC/USD','BTC-USD','{"settlement_eligible":true,"max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"CRYPTO","interval":"ONE_MINUTE"}'),
  ('ETH/USD','ETH-USD','{"settlement_eligible":true,"max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"CRYPTO","interval":"ONE_MINUTE"}'),
  ('SOL/USD','SOL-USD','{"settlement_eligible":true,"max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"CRYPTO","interval":"ONE_MINUTE"}'),
  ('XRP/USD','XRP-USD','{"settlement_eligible":true,"max_timestamp_delta_seconds":600,"maximum_coverage_gap_seconds":900,"asset_class":"CRYPTO","interval":"ONE_MINUTE"}')
) as v(canonical_key,external_key,metadata) on true
where p.code='COINBASE' and p.environment='PRODUCTION'
on conflict(provider_id,resource_type,canonical_key) do update set
  external_key=excluded.external_key,
  metadata=oracle.provider_resources.metadata || excluded.metadata,
  updated_at=statement_timestamp();

-- Explicit mappings are required before a provider's answer can count toward a
-- settlement quorum. Mapping presence alone does not assert that a secret exists.
insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'FINANCIAL_SYMBOL',v.canonical_key,v.external_key,'DISABLED',v.metadata::jsonb
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
  metadata=oracle.provider_resources.metadata || excluded.metadata,
  updated_at=statement_timestamp();

insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'FINANCIAL_SYMBOL',v.canonical_key,v.external_key,'DISABLED',v.metadata::jsonb
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
  metadata=oracle.provider_resources.metadata || excluded.metadata,
  updated_at=statement_timestamp();

insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'FRED_SERIES',v.series_id,v.series_id,'DISABLED',v.metadata::jsonb
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
  metadata=oracle.provider_resources.metadata || excluded.metadata,
  updated_at=statement_timestamp();

insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'FRED_SERIES',v.series_id,v.series_id,'DISABLED',v.metadata::jsonb
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
  metadata=oracle.provider_resources.metadata || excluded.metadata,
  updated_at=statement_timestamp();

-- Existing Oracle policies are immutable after approval. Provider/resource
-- registration is safe here, but changes to a settlement hierarchy must go
-- through a separately reviewed DRAFT policy and the Admin approval workflow.
-- Do not rewrite old market scopes or existing resolution records in this
-- provider-registry migration.

commit;
