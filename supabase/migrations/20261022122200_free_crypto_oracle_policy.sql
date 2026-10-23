begin;

-- Coinbase's public candle endpoint needs no API key. Production previously
-- had no governed Coinbase provider/resource rows, so a policy reference alone
-- could never produce eligible evidence. Register it explicitly and idempotently.
insert into integration.providers as p
  (code,name,provider_type,environment,status,priority,capabilities,public_metadata,secret_reference)
values
  ('COINBASE','Coinbase Exchange Public Candles','ORACLE','PRODUCTION','ACTIVE',20,
   '["CRYPTO_PRICE_THRESHOLD"]'::jsonb,
   '{"configured":true,"adapter":"COINBASE_PUBLIC_CANDLES","base_url":"https://api.coinbase.com","health_probe":"PUBLIC_ENDPOINT","credential_mode":"NONE","settlement_role":"CORROBORATING"}'::jsonb,
   null)
on conflict (code,environment) do update set
  name=excluded.name,
  provider_type=excluded.provider_type,
  status=case when p.status='DISABLED' then 'ACTIVE' else p.status end,
  capabilities=excluded.capabilities,
  public_metadata=p.public_metadata || excluded.public_metadata,
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

-- Approved Oracle policies are immutable. Seed a new policy version as DRAFT
-- with the keyless Coinbase source and CoinGecko source; an authorized reviewer
-- must activate it in Admin before new automatic threshold markets use it.
-- This makes the needed source configuration available without fabricating an
-- approval or modifying old policy facts.
insert into oracle.policies (
  public_id, name, capability_id, version, source_hierarchy, consensus_rule,
  close_rule, postponement_rule, cancellation_rule, void_rule,
  dispute_window_seconds, status, effective_at, created_by, approved_by
)
select
  gen_random_uuid(),
  current_policy.name,
  current_policy.capability_id,
  (select coalesce(max(existing.version), 0) + 1
   from oracle.policies existing where existing.name = current_policy.name),
  jsonb_build_array(
    jsonb_build_object('role','PRIMARY','provider_code','COINGECKO','priority',10),
    jsonb_build_object('role','CORROBORATING','provider_code','COINBASE','priority',20)
  ),
  coalesce(current_policy.consensus_rule, '{}'::jsonb) || jsonb_build_object(
    'finalization_mode','AUTO_AFTER_DISPUTE_WINDOW',
    'distinct_providers',true,
    'min_agreeing_providers',2
  ),
  current_policy.close_rule,
  current_policy.postponement_rule,
  current_policy.cancellation_rule,
  current_policy.void_rule,
  current_policy.dispute_window_seconds,
  'DRAFT',
  statement_timestamp(),
  null,
  null
from oracle.policies current_policy
where current_policy.name in ('VAD Crypto Threshold Launch Policy', 'VAD Sandbox Crypto Threshold Policy')
  and current_policy.status='ACTIVE'
  and current_policy.approved_by is not null
  and not exists (
    select 1
    from oracle.policies existing_draft
    where existing_draft.name=current_policy.name
      and existing_draft.status='DRAFT'
      and existing_draft.source_hierarchy @> '[{"role":"PRIMARY","provider_code":"COINGECKO","priority":10},{"role":"CORROBORATING","provider_code":"COINBASE","priority":20}]'::jsonb
  );


commit;
