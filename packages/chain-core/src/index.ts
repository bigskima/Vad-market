export type KnownChainFamily = 'EVM' | 'SOLANA';
export type KnownClientAdapter = 'EVM_V1' | 'SOLANA_V1';

export type ChainRuntimeConfig = {
  code: string;
  name: string;
  chainFamily: string;
  clientAdapter: string;
  evmChainId: number | string | null;
  nativeSymbol: string;
  explorerUrl: string | null;
  status: 'ACTIVE' | 'DISABLED' | 'SUSPENDED' | string;
};

export type ChainAssetRepresentation = {
  chainCode: string;
  assetCode: string;
  tokenStandard: string;
  tokenAddress: string;
  decimals: number;
  representationType: 'NATIVE' | 'BRIDGED' | 'WRAPPED' | 'THIRD_PARTY' | string;
  issuer?: string | null;
  status: 'ACTIVE' | 'DISABLED' | 'SUSPENDED' | string;
};

export type ChainAdapterDescriptor = {
  key: KnownClientAdapter;
  chainFamily: KnownChainFamily;
  walletProofStandard: 'EIP191' | 'ED25519';
  signatureEncoding: 'HEX' | 'BASE58';
  transactionModel: 'EVM' | 'SOLANA';
};

const BUILTIN_ADAPTERS: Record<KnownClientAdapter, ChainAdapterDescriptor> = {
  EVM_V1: {
    key: 'EVM_V1',
    chainFamily: 'EVM',
    walletProofStandard: 'EIP191',
    signatureEncoding: 'HEX',
    transactionModel: 'EVM',
  },
  SOLANA_V1: {
    key: 'SOLANA_V1',
    chainFamily: 'SOLANA',
    walletProofStandard: 'ED25519',
    signatureEncoding: 'BASE58',
    transactionModel: 'SOLANA',
  },
};

export class UnsupportedChainAdapterError extends Error {
  constructor(adapterKey: string) {
    super(`Unsupported VAD chain adapter: ${adapterKey}`);
    this.name = 'UnsupportedChainAdapterError';
  }
}

export function resolveChainAdapter(config: ChainRuntimeConfig): ChainAdapterDescriptor {
  const descriptor = BUILTIN_ADAPTERS[config.clientAdapter as KnownClientAdapter];
  if (!descriptor || descriptor.chainFamily !== config.chainFamily) {
    throw new UnsupportedChainAdapterError(config.clientAdapter);
  }

  if (descriptor.key === 'EVM_V1' && config.status === 'ACTIVE' && config.evmChainId == null) {
    throw new Error('Active EVM networks require an EVM chain ID.');
  }

  return descriptor;
}

export function isSupportedClientAdapter(value: string): value is KnownClientAdapter {
  return value === 'EVM_V1' || value === 'SOLANA_V1';
}

export function supportedClientAdapters(): readonly ChainAdapterDescriptor[] {
  return Object.values(BUILTIN_ADAPTERS);
}

export type {
  PreparedWalletTransaction,
  SubmittedWalletTransaction,
  WalletProviderAdapter,
  WalletSession,
  WalletSignatureProof,
} from './wallet';
export { assertWalletNetworkCompatibility } from './wallet';
