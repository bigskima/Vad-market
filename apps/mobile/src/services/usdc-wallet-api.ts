import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type UsdcNetworkBalance = {
  walletAddress: string;
  balance: string | null;
  tokenDecimals: number;
  gasReady: boolean;
  gasBalance: string | null;
  gasSymbol: string;
  readError?: string;
};

export type UsdcNetworkBalanceGroup = {
  chainCode: string;
  chainName: string;
  chainId: number;
  nativeSymbol: string;
  explorerUrl: string | null;
  tradingReady: boolean;
  tokenAddress: string | null;
  balances: UsdcNetworkBalance[];
  readStatus: 'OK' | 'NOT_CONFIGURED' | 'RPC_UNAVAILABLE';
};

export async function getMyUsdcNetworkBalances(): Promise<{
  wallets: string[];
  networks: UsdcNetworkBalanceGroup[];
}> {
  const { data, error } = await supabase.functions.invoke('usdc-wallet-gateway', {
    body: { action: 'balances' },
  });
  const payload = data as {
    ok?: boolean;
    wallets?: string[];
    networks?: UsdcNetworkBalanceGroup[];
    error?: string;
  } | null;

  if (error || !payload?.ok) {
    throw userFacingError(
      error ?? new Error(payload?.error ?? 'USDC balance lookup failed'),
      'portfolio',
      'We could not load your on-chain USDC balances right now.',
    );
  }

  return {
    wallets: Array.isArray(payload.wallets) ? payload.wallets : [],
    networks: Array.isArray(payload.networks) ? payload.networks : [],
  };
}
