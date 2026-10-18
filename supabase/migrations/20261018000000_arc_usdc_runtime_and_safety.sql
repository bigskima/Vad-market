begin;

-- Normalize the Arc Mainnet registry from Circle's published network configuration.
-- All production switches remain disabled; this is configuration, not activation.
update blockchain.chains
set
  name = 'Arc Mainnet',
  chain_family = 'EVM',
  client_adapter = 'EVM_V1',
  evm_chain_id = 5042,
  native_symbol = 'USDC',
  explorer_url = 'https://explorer.arc.io',
  status = 'DISABLED',
  metadata = metadata || jsonb_build_object(
    'environment', 'PRODUCTION',
    'network_kind', 'MAINNET',
    'rpc_url', 'https://rpc.mainnet.arc.io',
    'rpc_url_public', true,
    'rpc_url_source', 'CIRCLE_OFFICIAL_ARC_NETWORK_CONFIGURATION',
    'network_reference', 'https://docs.arc.network',
    'native_gas_token', 'USDC',
    'native_gas_decimals', 18,
    'erc20_usdc_decimals', 6,
    'launch_candidate', true,
    'activation_requires_review', true,
    'production_trading_enabled', false,
    'requires_verified_settlement_deployment', true
  ),
  updated_at = statement_timestamp()
where code = 'ARC';

update blockchain.asset_representations ar
set
  token_standard = 'ERC20',
  token_address = '0x3600000000000000000000000000000000000000',
  decimals = 6,
  representation_type = 'NATIVE',
  issuer = 'CIRCLE',
  status = 'DISABLED',
  metadata = ar.metadata || jsonb_build_object(
    'environment', 'PRODUCTION',
    'source', 'CIRCLE_OFFICIAL_USDC_ARC_CONFIGURATION',
    'network_kind', 'MAINNET',
    'native_gas_token', true,
    'native_gas_decimals', 18,
    'token_decimals', 6,
    'verified_contract_address', true,
    'activation_requires_review', true
  ),
  updated_at = statement_timestamp()
from blockchain.chains c, public.assets a
where ar.chain_id = c.id and ar.asset_id = a.id
  and c.code = 'ARC' and a.code = 'USDC';

update blockchain.jurisdiction_chains jc
set
  status = 'DISABLED',
  metadata = jc.metadata || jsonb_build_object(
    'environment', 'PRODUCTION',
    'reason', 'AWAITING_VERIFIED_SETTLEMENT_DEPLOYMENT',
    'activation_requires_review', true,
    'production_trading_enabled', false
  ),
  updated_at = statement_timestamp()
from blockchain.chains c, public.jurisdictions j
where jc.chain_id = c.id and jc.jurisdiction_id = j.id
  and c.code = 'ARC' and j.country_code = 'NG';

-- Client runtime config is available only when every required production gate
-- is active: jurisdiction, chain, native USDC representation and verified
-- VAD Settlement V1 deployment. Disabled networks never reach client wallets.
create or replace function public.my_crypto_network_runtime()
returns table (
  chain_code text,
  chain_name text,
  chain_family text,
  client_adapter text,
  evm_chain_id bigint,
  native_symbol text,
  explorer_url text,
  rpc_url text,
  asset_code text,
  token_address text,
  token_decimals smallint,
  contract_address text,
  protocol_key text,
  protocol_version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_account public.user_accounts;
begin
  v_account := private.require_active_account();

  return query
  select
    c.code,
    c.name,
    c.chain_family,
    c.client_adapter,
    c.evm_chain_id,
    c.native_symbol,
    c.explorer_url,
    nullif(btrim(c.metadata->>'rpc_url'), ''),
    a.code,
    ar.token_address,
    ar.decimals,
    cd.contract_address,
    cd.protocol_key,
    cd.protocol_version
  from public.jurisdictions j
  join public.jurisdiction_assets ja
    on ja.jurisdiction_id = j.id and ja.status = 'ACTIVE'
  join public.assets a
    on a.id = ja.asset_id and a.status = 'ACTIVE'
  join blockchain.jurisdiction_chains jc
    on jc.jurisdiction_id = j.id and jc.status = 'ACTIVE'
  join blockchain.chains c
    on c.id = jc.chain_id and c.status = 'ACTIVE'
  join blockchain.asset_representations ar
    on ar.chain_id = c.id and ar.asset_id = a.id and ar.status = 'ACTIVE'
  join blockchain.contract_deployments cd
    on cd.chain_id = c.id
   and cd.protocol_key = 'VAD_SETTLEMENT_V1'
   and cd.protocol_version = 1
   and cd.status = 'ACTIVE'
   and nullif(btrim(cd.contract_address), '') is not null
  where j.country_code = v_account.country_code
    and j.status = 'ACTIVE'
    and a.code = 'USDC'
    and c.chain_family = 'EVM'
    and c.evm_chain_id is not null
    and nullif(btrim(c.metadata->>'rpc_url'), '') is not null
  order by c.name;
end;
$function$;

revoke all on function public.my_crypto_network_runtime() from public, anon;
grant execute on function public.my_crypto_network_runtime() to authenticated;

commit;
