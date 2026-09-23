import type { ChainRuntimeConfig, KnownChainFamily, KnownClientAdapter } from './index';

export type WalletProviderMode = 'EMBEDDED' | 'EXTERNAL';
export type WalletCustodyModel = 'SELF_CUSTODY';

export type WalletSession = {
  chainFamily: KnownChainFamily;
  address: string;
  providerKey: string;
  providerMode: WalletProviderMode;
  custodyModel: WalletCustodyModel;
};

export type WalletSignatureProof = {
  address: string;
  signature: string;
  proofMethod: 'EIP191' | 'ED25519';
};

export type PreparedWalletTransaction = {
  chainCode: string;
  clientAdapter: KnownClientAdapter;
  payload: string;
  summary: string;
  expiresAt?: string | null;
};

export type SubmittedWalletTransaction = {
  transactionId: string;
  chainCode: string;
};

export interface WalletProviderAdapter {
  readonly providerKey: string;
  readonly chainFamily: KnownChainFamily;
  readonly providerMode: WalletProviderMode;
  readonly custodyModel: WalletCustodyModel;

  connect(): Promise<WalletSession>;
  disconnect(): Promise<void>;
  signMessage(message: string): Promise<WalletSignatureProof>;
  sendTransaction(transaction: PreparedWalletTransaction): Promise<SubmittedWalletTransaction>;
}

export function createWalletSession(input: {
  chainFamily: KnownChainFamily;
  address: string;
  providerKey: string;
  providerMode: WalletProviderMode;
  custodyModel?: WalletCustodyModel;
}): WalletSession {
  const address = input.address.trim();
  const providerKey = input.providerKey.trim();

  if (!address) throw new Error('Wallet address is required.');
  if (!providerKey) throw new Error('Wallet provider key is required.');

  return {
    chainFamily: input.chainFamily,
    address,
    providerKey,
    providerMode: input.providerMode,
    custodyModel: input.custodyModel ?? 'SELF_CUSTODY',
  };
}

export function assertWalletNetworkCompatibility(
  network: ChainRuntimeConfig,
  session: WalletSession,
) {
  if (network.chainFamily !== session.chainFamily) {
    throw new Error(
      `Wallet family ${session.chainFamily} cannot be used on ${network.chainFamily} network ${network.code}.`,
    );
  }
}
