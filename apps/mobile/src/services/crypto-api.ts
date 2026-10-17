import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type CryptoNetworkRow = {
  chain_code: string;
  chain_name: string;
  chain_family: string;
  client_adapter: string;
  evm_chain_id: number | string | null;
  native_symbol: string;
  explorer_url: string | null;
  rpc_url: string;
  asset_code: string;
  token_address: string;
  token_decimals: number;
  contract_address: string;
  protocol_key: string;
  protocol_version: number;
};

export async function getCryptoNetworks() {
  const { data, error } = await supabase.rpc('my_crypto_network_runtime');
  if (error) {
    throw userFacingError(error, 'portfolio', 'We could not load active USDC networks right now. Please try again.');
  }
  return (data ?? []) as CryptoNetworkRow[];
}
