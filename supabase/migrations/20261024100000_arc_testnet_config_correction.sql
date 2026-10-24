begin;

-- Arc Testnet configuration correction.
-- Source: https://docs.arc.io/arc/references/connect-to-arc.md (verified 2026-10-24)
--
-- Corrections applied:
--   rpc_url:    https://rpc.testnet.arc.network  →  https://rpc.testnet.arc.io
--   explorer_url: https://testnet.arcscan.app    →  https://explorer.testnet.arc.io
--
-- Chain ID 5042002 is confirmed correct.
-- USDC address 0x3600000000000000000000000000000000000000 is confirmed correct.
-- USDC ERC-20 decimals = 6 is confirmed correct.
-- USDC native (gas) decimals = 18; not stored here as the contract only uses ERC-20 interface.
-- Sub-second finality → confirmation_target = 1.
-- maxFeePerGas floor = 20 Gwei (enforced by Arc mempool; note for gas estimation).

update blockchain.chains
set
  explorer_url = 'https://explorer.testnet.arc.io',
  metadata = metadata || jsonb_build_object(
    'rpc_url',              'https://rpc.testnet.arc.io',
    'rpc_url_source',       'CIRCLE_ARC_OFFICIAL_DOCS_2026_10_24',
    'explorer_url_source',  'CIRCLE_ARC_OFFICIAL_DOCS_2026_10_24',
    'native_gas_decimals',  18,
    'erc20_usdc_decimals',  6,
    'confirmation_target',  1,
    'max_fee_per_gas_floor_gwei', 20,
    'finality_model',       'SUB_SECOND',
    'arc_foundry_required', true,
    'arc_foundry_install',  'https://docs.arc.io/arc/tutorials/install-arc-foundry.md',
    'config_verified_at',   '2026-10-24'
  ),
  updated_at = statement_timestamp()
where code = 'ARC_TESTNET';

-- Confirm the USDC ERC-20 address and decimals are still correct.
update blockchain.asset_representations ar
set
  metadata = ar.metadata || jsonb_build_object(
    'source',                 'CIRCLE_ARC_OFFICIAL_DOCS_2026_10_24',
    'erc20_decimals',         6,
    'native_gas_decimals',    18,
    'contract_note',          'ERC-20 interface at 0x3600000000000000000000000000000000000000; same underlying balance as native USDC',
    'config_verified_at',     '2026-10-24'
  ),
  updated_at = statement_timestamp()
from blockchain.chains c, public.assets a
where ar.chain_id = c.id
  and ar.asset_id = a.id
  and c.code    = 'ARC_TESTNET'
  and a.code    = 'USDC';

commit;
