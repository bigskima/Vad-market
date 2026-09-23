import type {
  OnchainPositionLockAuthorization,
  OnchainSettlementAuthorization,
} from '@vad/chain-core';

export type EvmSettlementNetwork = {
  chainCode: string;
  networkId: string;
  contractAddress: string;
  settlementTokenAddress: string;
};

export type EvmLockExecution = {
  network: EvmSettlementNetwork;
  authorization: OnchainPositionLockAuthorization;
  vadSignature: string;
  approvalRequired: boolean;
};

export type EvmSettlementExecution = {
  network: EvmSettlementNetwork;
  authorization: OnchainSettlementAuthorization;
  vadSignature: string;
};

export type SolanaPreparedExecution = {
  chainCode: string;
  networkId: string;
  programId: string;
  userAddress: string;
  vadSignerAddress: string;
  serializedTransactionBase64: string;
};

function nativeOnly(): never {
  throw new Error('VAD USDC settlement signing is native-app first in this release.');
}

export async function submitEvmPositionLock(
  _execution: EvmLockExecution,
): Promise<never> {
  return nativeOnly();
}

export async function submitEvmSettlement(
  _execution: EvmSettlementExecution,
): Promise<never> {
  return nativeOnly();
}

export async function submitSolanaPreparedSettlement(
  _execution: SolanaPreparedExecution,
): Promise<never> {
  return nativeOnly();
}
