import type { OnchainSettlementAuthorization } from '@vad/chain-core';
import {
  failOnchainIntent,
  prepareOnchainSettlement,
  recordOnchainSubmission,
  type OnchainPositionRow,
  type SignedOnchainSettlementAuthorization,
  type OnchainSettlementNoAction,
} from '@/services/onchain-api';
import { submitEvmSettlement, type EvmSettlementExecution } from '@/services/settlement-wallet';
import { ensureDynamicWalletConnectionsVerified, type VerifiedVadWallet } from '@/services/verified-wallet-api.web';

export type UsdcSettlementResult = { noAction: true; result: string } | { noAction: false; intentId: string; transactionHash: string; chainCode: string; status: string };

function findWallet(wallets: VerifiedVadWallet[], address: string) {
  const normalized = address.trim().toLowerCase();
  const wallet = wallets.find((row) => row.chain_family === 'EVM' && row.status === 'VERIFIED' && row.wallet_address.trim().toLowerCase() === normalized);
  if (!wallet) throw new Error('The verified wallet for this USDC position is not available in this session.');
  return wallet;
}

function toSettlementAuthorization(value: SignedOnchainSettlementAuthorization): OnchainSettlementAuthorization {
  return {
    authorizationId: value.authorizationId,
    positionId: value.positionId,
    marketId: value.marketId,
    userAddress: value.walletAddress,
    grossPayoutAtomic: value.grossPayoutAtomic,
    settlementFee: {
      policyName: 'settlement_fee',
      policyVersionId: String(value.settlementFeePolicyVersionId ?? '0'),
      amountAtomic: value.settlementFeeAmountAtomic,
    },
    resolutionHash: value.resolutionHash,
    deadlineUnix: Number(value.deadline),
  };
}

export async function settleUsdcPosition(position: OnchainPositionRow): Promise<UsdcSettlementResult> {
  if (!position.position_record_id) throw new Error('This USDC position is missing its reference.');
  if (!['CLAIM', 'REFUND'].includes(String(position.entitlement_type))) {
    throw new Error('This position does not currently have a claim or refund available.');
  }
  const wallets = await ensureDynamicWalletConnectionsVerified();
  const wallet = findWallet(wallets, position.wallet_address);
  const idempotencyKey = `usdc-settlement:${position.position_record_id}`;
  const result = await prepareOnchainSettlement({
    walletId: wallet.wallet_id,
    positionId: position.position_record_id,
    idempotencyKey,
  });
  if ('noAction' in result && result.noAction) return { noAction: true, result: result.result };

  const authorization = result as SignedOnchainSettlementAuthorization;
  const execution: EvmSettlementExecution = {
    network: {
      chainCode: authorization.chainCode,
      networkId: String(authorization.evmChainId),
      contractAddress: authorization.contractAddress,
      settlementTokenAddress: authorization.tokenAddress,
    },
    authorization: toSettlementAuthorization(authorization),
    vadSignature: authorization.signature,
  };
  let transactionHash: string | null = null;
  try {
    const submitted = await submitEvmSettlement(execution);
    transactionHash = submitted.transactionHash;
    const recorded = await recordOnchainSubmission({ intentId: authorization.intentId, transactionId: transactionHash });
    return { noAction: false, intentId: authorization.intentId, transactionHash, chainCode: authorization.chainCode, status: recorded.intentStatus };
  } catch (error) {
    if (!transactionHash) {
      try { await failOnchainIntent(authorization.intentId, 'CLIENT_SETTLEMENT_FAILED'); } catch { /* keep original error */ }
    }
    throw error;
  }
}
