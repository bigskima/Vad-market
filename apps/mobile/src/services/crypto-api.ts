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
  asset_code: string;
  token_standard: string;
  token_address: string;
  asset_decimals: number;
  representation_type: 'NATIVE' | 'BRIDGED' | 'WRAPPED' | 'THIRD_PARTY' | string;
};

export async function getCryptoNetworks() {
  const { data, error } = await supabase.rpc('my_crypto_networks');

  if (error) {
    throw userFacingError(
      error,
      'portfolio',
      'We could not load available crypto networks right now. Please try again.',
    );
  }

  return (data ?? []) as CryptoNetworkRow[];
}
