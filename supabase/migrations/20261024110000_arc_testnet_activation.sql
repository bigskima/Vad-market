begin;

-- Arc Testnet Activation — Phase 2 Step 5
-- Run this migration AFTER VadSettlementV1 is deployed to Arc Testnet.
-- Replace the placeholder contract address before applying.
--
-- Prerequisites:
--   1. 20261024100000_arc_testnet_config_correction.sql already applied.
--   2. arc-forge deploy has completed; VAD_SETTLEMENT_V1_ADDRESS is known.
--   3. Deployer/treasury wallets funded via https://faucet.circle.com (Arc Testnet USDC).
--
-- This migration activates the full chain for a single jurisdiction (NG).
-- Other jurisdictions can be activated via separate admin operations.
--
-- IMPORTANT: Replace '0x_REPLACE_WITH_DEPLOYED_CONTRACT_ADDRESS' with the actual
-- contract address from the arc-forge deploy output before running.

do $$
begin
  if '0x_REPLACE_WITH_DEPLOYED_CONTRACT_ADDRESS' = '0x_REPLACE_WITH_DEPLOYED_CONTRACT_ADDRESS' then
    raise exception
      'Replace the placeholder contract address before applying this migration.'
      using errcode = 'P0001';
  end if;
end $$;

-- 1. Activate the ARC_TESTNET chain.
update blockchain.chains
set
  status = 'ACTIVE',
  metadata = metadata || jsonb_build_object(
    'activated_at', statement_timestamp()::text,
    'activated_by', 'migration_20261024110000',
    'environment',  'SANDBOX'
  ),
  updated_at = statement_timestamp()
where code = 'ARC_TESTNET';

-- 2. Activate the USDC ERC-20 representation on ARC_TESTNET.
update blockchain.asset_representations ar
set
  status = 'ACTIVE',
  metadata = ar.metadata || jsonb_build_object(
    'activated_at', statement_timestamp()::text,
    'activated_by', 'migration_20261024110000'
  ),
  updated_at = statement_timestamp()
from blockchain.chains c, public.assets a
where ar.chain_id = c.id
  and ar.asset_id = a.id
  and c.code = 'ARC_TESTNET'
  and a.code = 'USDC';

-- 3. Activate the NG → ARC_TESTNET jurisdiction route.
update blockchain.jurisdiction_chains jc
set
  status = 'ACTIVE',
  metadata = jc.metadata || jsonb_build_object(
    'activated_at', statement_timestamp()::text,
    'activated_by', 'migration_20261024110000',
    'environment',  'SANDBOX'
  ),
  updated_at = statement_timestamp()
from blockchain.chains c, public.jurisdictions j
where jc.chain_id   = c.id
  and jc.jurisdiction_id = j.id
  and c.code = 'ARC_TESTNET'
  and j.country_code = 'NG';

-- 4. Register the VadSettlementV1 contract deployment.
insert into blockchain.contract_deployments (
  chain_id,
  protocol_key,
  protocol_version,
  contract_address,
  deployer_address,
  deploy_tx_hash,
  status,
  metadata
)
select
  c.id,
  'VAD_SETTLEMENT_V1',
  1,
  '0x_REPLACE_WITH_DEPLOYED_CONTRACT_ADDRESS',
  '0x52dAe9a2ae632Df8b4f5db1C7D2FE1A9e45992D2', -- ephemeral deployer
  null,  -- replace with actual tx hash after deploy
  'ACTIVE',
  jsonb_build_object(
    'environment',          'SANDBOX',
    'network',              'ARC_TESTNET',
    'chain_id_evm',         5042002,
    'usdc_address',         '0x3600000000000000000000000000000000000000',
    'quote_signer',         '0x1394c9c507f5640953EB03bBf5DFA8d11F7f634b',
    'settlement_signer',    '0xe732881D5b561EA8B70A5B5e65c4ace10c757F3a',
    'resolver',             '0xE98598caE77D7D6e73470f77D509E155B0C780Cd',
    'treasury',             '0x9a85eCc03742F34b184528AC7150A66D2B8cD161',
    'keys_type',            'EPHEMERAL_TESTNET',
    'foundry_version',      'arc-forge',
    'deployed_at',          statement_timestamp()::text,
    'activation_migration', '20261024110000'
  )
from blockchain.chains c
where c.code = 'ARC_TESTNET'
on conflict (chain_id, protocol_key, protocol_version)
  do update set
    contract_address = excluded.contract_address,
    status           = excluded.status,
    metadata         = blockchain.contract_deployments.metadata || excluded.metadata,
    updated_at       = statement_timestamp();

-- 5. Create an instrument venue for the first ARC_TESTNET USDC POOL market.
--    A market instrument row must already exist; this links it to the chain.
--    The instrument_id is set to NULL here — the admin must supply a real
--    market.instruments.id for a live USDC POOL market before venue is usable.
--    This insert is intentionally idempotent (on conflict do nothing).
--    Admins can create additional venues via admin APIs.
insert into market.instrument_venues (
  chain_id,
  contract_deployment_id,
  instrument_id,
  status,
  metadata
)
select
  c.id,
  cd.id,
  null, -- admin links a real instrument_id post-migration
  'PENDING',
  jsonb_build_object(
    'environment',  'SANDBOX',
    'purpose',      'FIRST_ARC_TESTNET_USDC_POOL_VENUE',
    'created_by',   'migration_20261024110000',
    'note',         'Set instrument_id and activate via admin API after first test market is created'
  )
from blockchain.chains c
join blockchain.contract_deployments cd
  on cd.chain_id = c.id
 and cd.protocol_key     = 'VAD_SETTLEMENT_V1'
 and cd.protocol_version = 1
 and cd.status           = 'ACTIVE'
where c.code = 'ARC_TESTNET'
on conflict do nothing;

commit;
