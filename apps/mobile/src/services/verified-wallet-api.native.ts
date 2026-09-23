import {
  getWalletAccounts,
  signMessage,
} from '@dynamic-labs-sdk/client';

import {
  dynamicClient,
  initializeDynamicWalletClient,
} from '@/lib/dynamic-client.native';
import { supabase } from '@/lib/supabase';

export type VerifiedVadWallet = {
  wallet_id: string;
  chain_family: 'EVM' | 'SOLANA';
  wallet_provider: string | null;
  wallet_address: string;
  status: 'VERIFIED' | 'REVOKED';
  proof_method: string | null;
  verified_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

type Challenge = {
  challengeId: string;
  chainFamily: 'EVM' | 'SOLANA';
  walletAddress: string;
  walletAddressNormalized: string;
  message: string;
  expiresAt: string;
};

function fail(error: unknown, fallback: string): never {
  if (error instanceof Error) throw error;
  throw new Error(fallback);
}

function normalizeAddress(chainFamily: 'EVM' | 'SOLANA', address: string) {
  return chainFamily === 'EVM' ? address.trim().toLowerCase() : address.trim();
}

async function invokeWalletGateway<T>(
  body: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('wallet-gateway', { body });

  if (error) fail(error, fallback);

  const payload = data as ({ error?: string } & T) | null;
  if (!payload || payload.error) {
    throw new Error(payload?.error ?? fallback);
  }

  return payload as T;
}

export async function listVadWalletConnections() {
  const payload = await invokeWalletGateway<{
    ok: true;
    wallets: VerifiedVadWallet[];
  }>({ action: 'list' }, 'VAD could not load your verified wallet connections.');

  return payload.wallets ?? [];
}

async function verifyWalletAccount(
  walletAccount: ReturnType<typeof getWalletAccounts>[number],
) {
  if (!dynamicClient) throw new Error('Dynamic wallet is not configured.');

  const chainFamily = walletAccount.chain === 'SOL' ? 'SOLANA' : 'EVM';
  const address = walletAccount.address.trim();

  const challenge = await invokeWalletGateway<Challenge & {
    walletProvider?: string | null;
  }>({
    action: 'challenge',
    chainFamily,
    walletAddress: address,
    walletProvider: 'DYNAMIC',
  }, 'VAD could not prepare wallet ownership verification.');

  const signed = await signMessage({
    walletAccount,
    message: challenge.message,
  }, dynamicClient);

  if (!signed?.signature) {
    throw new Error('Dynamic did not return a wallet ownership signature.');
  }

  const verified = await invokeWalletGateway<{
    ok: true;
    wallet: VerifiedVadWallet;
  }>({
    action: 'verify',
    challengeId: challenge.challengeId,
    signature: signed.signature,
    walletProvider: 'DYNAMIC',
  }, 'VAD could not verify this Dynamic wallet.');

  return verified.wallet;
}

export async function ensureDynamicWalletConnectionsVerified() {
  await initializeDynamicWalletClient();
  if (!dynamicClient) throw new Error('Dynamic wallet is not configured.');

  const accounts = getWalletAccounts(dynamicClient);
  if (!accounts.length) return [] as VerifiedVadWallet[];

  const existing = await listVadWalletConnections();
  const verifiedByKey = new Map(
    existing
      .filter((wallet) => wallet.status === 'VERIFIED')
      .map((wallet) => [
        `${wallet.chain_family}:${normalizeAddress(wallet.chain_family, wallet.wallet_address)}`,
        wallet,
      ]),
  );

  const result: VerifiedVadWallet[] = [];

  for (const account of accounts) {
    const chainFamily = account.chain === 'SOL' ? 'SOLANA' : 'EVM';
    const key = `${chainFamily}:${normalizeAddress(chainFamily, account.address)}`;
    const current = verifiedByKey.get(key);

    if (current) {
      result.push(current);
      continue;
    }

    const verified = await verifyWalletAccount(account);
    result.push(verified);
    verifiedByKey.set(key, verified);
  }

  return result;
}
