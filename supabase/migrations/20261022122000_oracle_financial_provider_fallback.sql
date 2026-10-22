begin;

-- Extend the governed Oracle resource registry for financial instruments and
-- official economic series. Credentials remain in Edge Function secrets.
alter table oracle.provider_resources
  drop constraint if exists provider_resources_resource_type_check;
alter table oracle.provider_resources
  add constraint provider_resources_resource_type_check
  check (resource_type in (
    'CRYPTO_PAIR','CANONICAL_EVENT','SPORTS_COMPETITION','PUBLIC_EVENT',
    'FINANCIAL_SYMBOL','FRED_SERIES'
  ));

-- Register these as governed Oracle providers, independently of display-only
-- market data sources. Existing rows are updated conservatively; we do not
-- auto-activate providers because provider governance must approve them.
insert into integration.providers as p
  (code,name,provider_type,environment,status,priority,capabilities,public_metadata,secret_reference)
values
  ('TWELVE_DATA','Twelve Data Oracle','ORACLE','PRODUCTION','DISABLED',30,
   '["CRYPTO_PRICE_THRESHOLD","FINANCIAL_PRICE_THRESHOLD"]'::jsonb,
   '{"configured":false,"adapter":"TWELVE_DATA_HISTORICAL","base_url":"https://api.twelvedata.com","health_probe":"CREDENTIAL_ONLY","settlement_role":"CORROBORATING","notes":"Requires admin approval and TWELVE_DATA_API_KEY Edge Function secret."}'::jsonb,
   'TWELVE_DATA_API_KEY'),
  ('FRED','Federal Reserve Economic Data Oracle','ORACLE','PRODUCTION','DISABLED',40,
   '["FRED_SERIES_THRESHOLD"]'::jsonb,
   '{"configured":false,"adapter":"FRED_SERIES_OBSERVATIONS","base_url":"https://api.stlouisfed.org/fred","health_probe":"CREDENTIAL_ONLY","settlement_role":"CORROBORATING","notes":"Requires admin approval and FRED_API_KEY Edge Function secret."}'::jsonb,
   'FRED_API_KEY'),
  ('ALPHA_VANTAGE','Alpha Vantage Economic Data Oracle','ORACLE','PRODUCTION','DISABLED',50,
   '["FINANCIAL_PRICE_THRESHOLD","FRED_SERIES_THRESHOLD"]'::jsonb,
   '{"configured":false,"adapter":"ALPHA_VANTAGE_ECONOMIC_SERIES","base_url":"https://www.alphavantage.co","health_probe":"CREDENTIAL_ONLY","settlement_role":"CORROBORATING","notes":"Secondary series only; requires explicit per-series mapping and ALPHA_VANTAGE_API_KEY."}'::jsonb,
   'ALPHA_VANTAGE_API_KEY')
on conflict (code,environment) do update set
  name=excluded.name,
  capabilities=excluded.capabilities,
  public_metadata=integration.providers.public_metadata || excluded.public_metadata,
  secret_reference=excluded.secret_reference,
  updated_at=statement_timestamp();

-- Register the common financial instruments as inactive resources. Activation
-- is an explicit governance action after checking the provider plan and secrets.
insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'FINANCIAL_SYMBOL',x.canonical_key,x.external_key,'DISABLED',x.metadata
from integration.providers p
cross join (values
  ('AAPL/USD','AAPL','{"instrument":"Apple Inc","asset_class":"STOCKS","interval":"1min","max_timestamp_delta_seconds":600,"purpose":"RESOLUTION_EVIDENCE"}'::jsonb),
  ('MSFT/USD','MSFT','{"instrument":"Microsoft","asset_class":"STOCKS","interval":"1min","max_timestamp_delta_seconds":600,"purpose":"RESOLUTION_EVIDENCE"}'::jsonb),
  ('NVDA/USD','NVDA','{"instrument":"NVIDIA","asset_class":"STOCKS","interval":"1min","max_timestamp_delta_seconds":600,"purpose":"RESOLUTION_EVIDENCE"}'::jsonb),
  ('XAU/USD','XAU/USD','{"instrument":"Gold Spot","asset_class":"COMMODITIES","interval":"1min","max_timestamp_delta_seconds":600,"purpose":"RESOLUTION_EVIDENCE"}'::jsonb),
  ('WTI/USD','WTI/USD','{"instrument":"WTI Crude Oil","asset_class":"COMMODITIES","interval":"1min","max_timestamp_delta_seconds":600,"purpose":"RESOLUTION_EVIDENCE"}'::jsonb),
  ('EUR/USD','EUR/USD','{"instrument":"Euro / US Dollar","asset_class":"FOREX","interval":"1min","max_timestamp_delta_seconds":600,"purpose":"RESOLUTION_EVIDENCE"}'::jsonb),
  ('USD/NGN','USD/NGN','{"instrument":"US Dollar / Nigerian Naira","asset_class":"FOREX","interval":"1min","max_timestamp_delta_seconds":600,"purpose":"RESOLUTION_EVIDENCE"}'::jsonb)
) as x(canonical_key,external_key,metadata)
where p.code='TWELVE_DATA' and p.environment='PRODUCTION'
on conflict(provider_id,resource_type,canonical_key) do update set
  external_key=excluded.external_key,
  metadata=oracle.provider_resources.metadata || excluded.metadata,
  updated_at=statement_timestamp();

insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'FRED_SERIES',x.series_id,x.series_id,'DISABLED',x.metadata
from integration.providers p
cross join (values
  ('CPIAUCSL','{"title":"Consumer Price Index for All Urban Consumers","units":"Index 1982-1984=100","purpose":"RESOLUTION_EVIDENCE"}'::jsonb),
  ('UNRATE','{"title":"Unemployment Rate","units":"Percent","purpose":"RESOLUTION_EVIDENCE"}'::jsonb),
  ('GDP','{"title":"Gross Domestic Product","units":"Billions of Dollars","purpose":"RESOLUTION_EVIDENCE"}'::jsonb),
  ('FEDFUNDS','{"title":"Federal Funds Effective Rate","units":"Percent","purpose":"RESOLUTION_EVIDENCE"}'::jsonb),
  ('DGS10','{"title":"10-Year Treasury Constant Maturity Rate","units":"Percent","purpose":"RESOLUTION_EVIDENCE"}'::jsonb),
  ('DFF','{"title":"Effective Federal Funds Rate","units":"Percent","purpose":"RESOLUTION_EVIDENCE"}'::jsonb)
) as x(series_id,metadata)
where p.code='FRED' and p.environment='PRODUCTION'
on conflict(provider_id,resource_type,canonical_key) do update set
  external_key=excluded.external_key,
  metadata=oracle.provider_resources.metadata || excluded.metadata,
  updated_at=statement_timestamp();

commit;
