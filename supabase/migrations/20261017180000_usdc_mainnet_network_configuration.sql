-- Register production USDC network metadata without activating production trading.
-- Public RPC endpoints are discoverable configuration, not secrets. Production activation
-- remains blocked until a VAD_SETTLEMENT_V1 deployment is independently verified.
update blockchain.chains
set
  explorer_url = 'https://explorer.arc.io',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'environment', 'PRODUCTION',
    'network_kind', 'MAINNET',
    'launch_candidate', true,
    'native_gas_token', 'USDC',
    'native_gas_decimals', 18,
    'erc20_usdc_decimals', 6,
    'rpc_url', 'https://rpc.mainnet.arc.io',
    'rpc_url_source', 'OFFICIAL_ARC_NETWORK_DOCS',
    'confirmation_target', 1,
    'activation_requires_review', true,
    'requires_verified_settlement_deployment', true,
    'production_trading_enabled', false
  ),
  updated_at = statement_timestamp()
where code = 'ARC';

update blockchain.chains
set
  explorer_url = 'https://polygonscan.com',
  native_symbol = 'POL',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'environment', 'PRODUCTION',
    'network_kind', 'MAINNET',
    'launch_candidate', true,
    'native_gas_token', 'POL',
    'rpc_url', 'https://polygon-rpc.com',
    'rpc_url_source', 'PUBLIC_POLYGON_RPC',
    'confirmation_target', 128,
    'activation_requires_review', true,
    'requires_verified_settlement_deployment', true,
    'production_trading_enabled', false,
    'usdc_representation', 'CIRCLE_NATIVE_USDC_ONLY'
  ),
  updated_at = statement_timestamp()
where code = 'POLYGON';

-- Keep the token contracts registered but disabled until the deployment, wallet,
-- fee, finality, and jurisdiction checks have passed.
update blockchain.asset_representations ar
set metadata = coalesce(ar.metadata, '{}'::jsonb) || case c.code
  when 'ARC' then jsonb_build_object(
    'source', 'OFFICIAL_ARC_NETWORK_CONFIGURATION',
    'token_decimals', 6,
    'native_gas_decimals', 18,
    'native_gas_token', true,
    'verified_contract_address', true,
    'activation_requires_review', true
  )
  when 'POLYGON' then jsonb_build_object(
    'source', 'CIRCLE_OFFICIAL_USDC_NETWORK_LISTING',
    'token_decimals', 6,
    'native_gas_decimals', null,
    'native_gas_token', false,
    'verified_contract_address', true,
    'bridged_usdc_e_supported', false,
    'activation_requires_review', true
  )
  else '{}'::jsonb
end,
updated_at = statement_timestamp()
from blockchain.chains c
join public.assets a on a.code = 'USDC'
where ar.chain_id = c.id
  and ar.asset_id = a.id
  and c.code in ('ARC', 'POLYGON');

update blockchain.jurisdiction_chains jc
set status = 'DISABLED',
    metadata = coalesce(jc.metadata, '{}'::jsonb) || jsonb_build_object(
      'production_trading_enabled', false,
      'reason', 'AWAITING_VERIFIED_SETTLEMENT_DEPLOYMENT'
    ),
    updated_at = statement_timestamp()
from blockchain.chains c
where jc.chain_id = c.id
  and c.code in ('ARC', 'POLYGON');

update blockchain.asset_representations ar
set status = 'DISABLED', updated_at = statement_timestamp()
from blockchain.chains c
join public.assets a on a.code = 'USDC'
where ar.chain_id = c.id
  and ar.asset_id = a.id
  and c.code in ('ARC', 'POLYGON');

update blockchain.chains
set status = 'DISABLED', updated_at = statement_timestamp()
where code in ('ARC', 'POLYGON');
