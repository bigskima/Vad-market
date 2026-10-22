begin;

-- The production threshold-market creation RPC already requires both
-- Coinbase and Kraken resource mappings. Make the approved resolver policy
-- match that path so market creation and Oracle execution use the same sources.
-- These providers are public, keyless historical sources; Pyth and a CoinGecko
-- credential are not prerequisites for a new BTC/USD threshold market.

insert into integration.providers as existing_provider
  (code,name,provider_type,environment,status,priority,capabilities,public_metadata,secret_reference)
values
  ('COINBASE','Coinbase Exchange Public Candles','ORACLE','PRODUCTION','ACTIVE',20,
   '["CRYPTO_PRICE_THRESHOLD","FINANCIAL_PRICE_THRESHOLD"]'::jsonb,
   '{"configured":true,"adapter":"COINBASE_PUBLIC_CANDLES_V1","base_url":"https://api.coinbase.com","credential_mode":"NONE","settlement_role":"PRIMARY"}'::jsonb,
   null),
  ('KRAKEN','Kraken Public OHLC','ORACLE','PRODUCTION','ACTIVE',30,
   '["CRYPTO_PRICE_THRESHOLD","FINANCIAL_PRICE_THRESHOLD"]'::jsonb,
   '{"configured":true,"adapter":"KRAKEN_PUBLIC_OHLC_V1","base_url":"https://api.kraken.com","credential_mode":"NONE","settlement_role":"CORROBORATING"}'::jsonb,
   null)
on conflict (code,environment) do update set
  provider_type=excluded.provider_type,
  capabilities=(
    select coalesce(jsonb_agg(to_jsonb(merged.capability)), '[]'::jsonb)
    from (
      select jsonb_array_elements_text(coalesce(existing_provider.capabilities,'[]'::jsonb)) as capability
      union
      select jsonb_array_elements_text(excluded.capabilities) as capability
    ) as merged
  ),
  public_metadata=existing_provider.public_metadata || excluded.public_metadata,
  secret_reference=null,
  updated_at=statement_timestamp();

-- Add supported public-market mappings only where they do not already exist.
-- The user-facing asset check separately verifies the pair is registered with
-- both venues before allowing automatic threshold market creation.
insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'CRYPTO_PAIR',x.canonical_key,x.external_key,'ACTIVE',
       jsonb_build_object('quote','USD','settlement_eligible',true,
         'max_timestamp_delta_seconds',600,'interval','1m','purpose','RESOLUTION_EVIDENCE')
from integration.providers p
cross join (values
  ('BTC/USD','BTC-USD','COINBASE'),
  ('ETH/USD','ETH-USD','COINBASE'),
  ('ADA/USD','ADA-USD','COINBASE'),
  ('AVAX/USD','AVAX-USD','COINBASE'),
  ('BNB/USD','BNB-USD','COINBASE'),
  ('DOGE/USD','DOGE-USD','COINBASE'),
  ('DOT/USD','DOT-USD','COINBASE'),
  ('LTC/USD','LTC-USD','COINBASE'),
  ('SOL/USD','SOL-USD','COINBASE'),
  ('XRP/USD','XRP-USD','COINBASE'),
  ('BTC/USD','XBTUSD','KRAKEN'),
  ('ETH/USD','ETHUSD','KRAKEN'),
  ('ADA/USD','ADAUSD','KRAKEN'),
  ('LTC/USD','LTCUSD','KRAKEN'),
  ('SOL/USD','SOLUSD','KRAKEN'),
  ('XRP/USD','XRPUSD','KRAKEN')
) as x(canonical_key,external_key,provider_code)
where p.code=x.provider_code and p.environment='PRODUCTION'
on conflict(provider_id,resource_type,canonical_key) do nothing;

-- Preserve the existing approved policy and any historical event bindings.
-- The preceding keyless-source migration already created DRAFT Coinbase/Kraken
-- policy versions. They must go through the existing Oracle reviewer workflow:
-- admin_approve_oracle_policy enforces oracle.review and dual control. This
-- migration deliberately does not mutate or auto-approve an ACTIVE policy.

-- Admin event discovery has previously returned PostgREST schema-cache 404s
-- for a function that exists and grants EXECUTE to authenticated users.
select pg_notify('pgrst','reload schema');

commit;
