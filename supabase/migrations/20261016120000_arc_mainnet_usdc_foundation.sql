begin;

-- Arc Mainnet USDC foundation.
-- This registers the production network and official USDC representation, but
-- deliberately leaves the chain, token, jurisdiction route, and trading
-- capabilities disabled. Production activation requires a separate reviewed
-- operational change after wallet, contract, and settlement verification.

insert into blockchain.chains (
  code,
  name,
  chain_family,
  client_adapter,
  evm_chain_id,
  native_symbol,
  explorer_url,
  status,
  metadata
) values (
  'ARC',
  'Arc Mainnet',
  'EVM',
  'EVM_V1',
  5042,
  'USDC',
  'https://explorer.arc.network',
  'DISABLED',
  jsonb_build_object(
    'environment', 'PRODUCTION',
    'network_kind', 'MAINNET',
    'network_reference', 'https://docs.arc.network',
    'native_gas_token', 'USDC',
    'launch_candidate', true,
    'activation_requires_review', true,
    'rpc_url_configured_by_secret', true
  )
)
on conflict (code) do update set
  name = excluded.name,
  chain_family = excluded.chain_family,
  client_adapter = excluded.client_adapter,
  evm_chain_id = excluded.evm_chain_id,
  native_symbol = excluded.native_symbol,
  explorer_url = excluded.explorer_url,
  -- Never activate a production network implicitly from a migration.
  status = 'DISABLED',
  metadata = blockchain.chains.metadata || excluded.metadata,
  updated_at = statement_timestamp();

insert into blockchain.asset_representations (
  chain_id,
  asset_id,
  token_standard,
  token_address,
  decimals,
  representation_type,
  issuer,
  status,
  metadata
)
select
  c.id,
  a.id,
  'ERC20',
  '0x3600000000000000000000000000000000000000',
  6,
  'NATIVE',
  'CIRCLE',
  'DISABLED',
  jsonb_build_object(
    'environment', 'PRODUCTION',
    'source', 'Circle / Arc official network configuration',
    'network_kind', 'MAINNET',
    'native_gas_token', true,
    'activation_requires_review', true
  )
from blockchain.chains c
cross join public.assets a
where c.code = 'ARC'
  and a.code = 'USDC'
on conflict (chain_id, asset_id, token_address) do update set
  token_standard = excluded.token_standard,
  decimals = excluded.decimals,
  representation_type = excluded.representation_type,
  issuer = excluded.issuer,
  status = 'DISABLED',
  metadata = blockchain.asset_representations.metadata || excluded.metadata,
  updated_at = statement_timestamp();

insert into blockchain.jurisdiction_chains (
  jurisdiction_id,
  chain_id,
  status,
  metadata
)
select
  j.id,
  c.id,
  'DISABLED',
  jsonb_build_object(
    'environment', 'PRODUCTION',
    'created_for', 'ARC_MAINNET_USDC_FOUNDATION',
    'activation_requires_review', true
  )
from public.jurisdictions j
cross join blockchain.chains c
where c.code = 'ARC'
on conflict (jurisdiction_id, chain_id) do update set
  status = 'DISABLED',
  metadata = blockchain.jurisdiction_chains.metadata || excluded.metadata;

commit;
