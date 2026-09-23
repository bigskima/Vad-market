export type EvmSettlementNetwork = {
  chainCode: string;
  networkId: string;
  contractAddress: string;
  settlementTokenAddress: string;
};

function nativeOnly(): never {
  throw new Error('VAD USDC settlement signing is native-app first in this release.');
}

export async function submitEvmPositionLock(): Promise<never> {
  return nativeOnly();
}

export async function submitEvmSettlement(): Promise<never> {
  return nativeOnly();
}

export async function submitSolanaPreparedSettlement(): Promise<never> {
  return nativeOnly();
}
