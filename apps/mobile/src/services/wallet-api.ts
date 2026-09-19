import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type WalletChainFamily = 'EVM' | 'SOLANA';

export type WalletChallenge = {
  challengeId: string;
  chainFamily: WalletChainFamily;
  walletAddress: string;
  message: string;
  expiresAt: string;
  walletProvider?: string | null;
};

export type WalletConnection = {
  wallet_id: string;
  chain_family: WalletChainFamily;
  wallet_provider: string | null;
  wallet_address: string;
  status: 'PENDING' | 'VERIFIED' | 'REVOKED';
  proof_method: string | null;
  verified_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

async function accessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Your session has expired. Sign in again to continue.');
  }
  return data.session.access_token;
}

export async function requestWalletChallenge(input: {
  chainFamily: WalletChainFamily;
  walletAddress: string;
  walletProvider?: string;
}) {
  const token = await accessToken();
  const { data, error } = await supabase.functions.invoke('wallet-gateway', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      action: 'challenge',
      chainFamily: input.chainFamily,
      walletAddress: input.walletAddress,
      walletProvider: input.walletProvider,
    },
  });

  if (error) {
    throw userFacingError(error, 'portfolio', 'We could not prepare wallet verification. Please try again.');
  }
  if (!data?.challengeId || !data?.message) {
    throw new Error('VAD could not prepare a wallet verification request.');
  }

  return data as WalletChallenge;
}

export async function verifyWalletChallenge(input: {
  challengeId: string;
  signature: string;
  walletProvider?: string;
}) {
  const token = await accessToken();
  const { data, error } = await supabase.functions.invoke('wallet-gateway', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      action: 'verify',
      challengeId: input.challengeId,
      signature: input.signature,
      walletProvider: input.walletProvider,
    },
  });

  if (error) {
    throw userFacingError(error, 'portfolio', 'We could not verify this wallet. Please try again.');
  }
  if (!data?.ok || !data?.wallet) {
    const code = String(data?.error ?? '');
    if (code === 'WALLET_SIGNATURE_INVALID') {
      throw new Error('The wallet signature did not match this verification request.');
    }
    throw new Error('VAD could not verify this wallet.');
  }

  return data.wallet as {
    walletId: string;
    chainFamily: WalletChainFamily;
    walletAddress: string;
    walletProvider: string | null;
    status: 'VERIFIED';
    verifiedAt: string;
  };
}

export async function getMyWalletConnections() {
  const token = await accessToken();
  const { data, error } = await supabase.functions.invoke('wallet-gateway', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { action: 'list' },
  });

  if (error) {
    throw userFacingError(error, 'portfolio', 'We could not load your connected wallets.');
  }
  if (!data?.ok || !Array.isArray(data?.wallets)) {
    throw new Error('VAD could not load your connected wallets.');
  }

  return data.wallets as WalletConnection[];
}

export async function revokeWalletConnection(walletId: string) {
  const token = await accessToken();
  const { data, error } = await supabase.functions.invoke('wallet-gateway', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { action: 'revoke', walletId },
  });

  if (error) {
    throw userFacingError(error, 'portfolio', 'We could not disconnect this wallet.');
  }
  if (!data?.ok) {
    throw new Error('VAD could not disconnect this wallet.');
  }

  return true;
}
