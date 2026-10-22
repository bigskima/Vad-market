begin;

-- Coinbase's public candle endpoint needs no API key. Production previously
-- had no governed Coinbase provider/resource rows, so a policy reference alone
-- could never produce eligible evidence. Register it explicitly and idempotently.
insert into integration.providers as p
  (code,name,provider_type,environment,status,priority,capabilities,public_metadata,secret_reference)
values
  ('COINBASE','Coinbase Exchange Public Candles','ORACLE','PRODUCTION','ACTIVE',20,
   '["CRYPTO_PRICE_THRESHOLD"]'::jsonb,
   '{"configured":true,"adapter":"COINBASE_PUBLIC_CANDLES","base_url":"https://api.exchange.coinbase.com","health_probe":"PUBLIC_ENDPOINT","credential_mode":"NONE","settlement_role":"CORROBORATING"}'::jsonb,
   null)
on conflict (code,environment) do update set
  name=excluded.name,
  provider_type=excluded.provider_type,
  status=case when integration.providers.status='DISABLED' then 'ACTIVE' else integration.providers.status end,
  capabilities=excluded.capabilities,
  public_metadata=integration.providers.public_metadata || excluded.public_metadata,
  secret_reference=null,
  updated_at=statement_timestamp();

insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'CRYPTO_PAIR',x.canonical_key,x.external_key,'ACTIVE',
       jsonb_build_object('quote','USD','historical_mode','RANGE_NEAREST',
         'settlement_eligible',true,'max_timestamp_delta_seconds',600,
         'purpose','RESOLUTION_EVIDENCE')
from integration.providers p
cross join (values
  ('BTC/USD','BTC-USD'),
  ('ETH/USD','ETH-USD'),
  ('ADA/USD','ADA-USD'),
  ('AVAX/USD','AVAX-USD'),
  ('BNB/USD','BNB-USD'),
  ('DOGE/USD','DOGE-USD'),
  ('DOT/USD','DOT-USD'),
  ('LTC/USD','LTC-USD'),
  ('SOL/USD','SOL-USD'),
  ('XRP/USD','XRP-USD')
) as x(canonical_key,external_key)
where p.code='COINBASE' and p.environment='PRODUCTION'
on conflict(provider_id,resource_type,canonical_key) do update set
  external_key=excluded.external_key,
  status='ACTIVE',
  metadata=oracle.provider_resources.metadata || excluded.metadata,
  updated_at=statement_timestamp();

-- VAD crypto settlement must not depend on a paid Pyth API subscription.
-- Use CoinGecko (free Demo API key) and Coinbase public historical candles
-- as two separately recorded providers. Keep the quorum at two: if either
-- source cannot produce eligible evidence, automatic resolution stays pending.
update oracle.policies
set source_hierarchy = jsonb_build_array(
      jsonb_build_object('role','PRIMARY','provider_code','COINGECKO','priority',10),
      jsonb_build_object('role','CORROBORATING','provider_code','COINBASE','priority',20)
    ),
    consensus_rule = coalesce(consensus_rule, '{}'::jsonb)
      || jsonb_build_object(
        'finalization_mode','AUTO_AFTER_DISPUTE_WINDOW',
        'distinct_providers',true,
        'min_agreeing_providers',2
      )
where name in ('VAD Crypto Threshold Launch Policy', 'VAD Sandbox Crypto Threshold Policy')
  and status='ACTIVE'
  and approved_by is not null;

commit;
