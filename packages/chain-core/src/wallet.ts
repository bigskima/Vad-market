import type { ChainRuntimeConfig, KnownChainFamily, KnownClientAdapter } from './index';

export type WalletSession = {
  chainFamily: KnownChainFamily;
  address: string;
  providerKey: string;
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

  connect(): Promise<WalletSession>;
  disconnect(): Promise<void>;
  signMessage(message: string): Promise<WalletSignatureProof>;
  sendTransaction(transaction: PreparedWalletTransaction): Promise<SubmittedWalletTransaction>;
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
