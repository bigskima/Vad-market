import type { OnchainPositionLockAuthorization } from '@vad/chain-core';
import { failOnchainIntent, prepareOnchainPrediction, recordOnchainSubmission, type SignedOnchainPredictionAuthorization } from '@/services/onchain-api';
import { submitEvmPositionLock, type EvmLockExecution } from '@/services/settlement-wallet';
import { ensureDynamicWalletConnectionsVerified, type VerifiedVadWallet } from '@/services/verified-wallet-api.web';
import type { PreparedUsdcPrediction, PrepareUsdcPredictionInput, SubmittedUsdcPrediction } from '@/services/onchain-prediction.types';
export type { PreparedUsdcPrediction, PrepareUsdcPredictionInput, SubmittedUsdcPrediction } from '@/services/onchain-prediction.types';

function chooseDynamicEvmWallet(wallets: VerifiedVadWallet[]) {
  const wallet = wallets.find((candidate) => candidate.chain_family === 'EVM' && candidate.status === 'VERIFIED');
  if (!wallet) throw new Error('A verified Dynamic EVM wallet is required before you can commit a USDC prediction.');
  return wallet;
}
function toLockAuthorization(authorization: SignedOnchainPredictionAuthorization): OnchainPositionLockAuthorization {
  return {
    authorizationId: authorization.authorizationId, positionId: authorization.positionId, marketId: authorization.marketId,
    outcomeId: authorization.outcomeId, userAddress: authorization.walletAddress,
    collateralAmountAtomic: authorization.collateralAmountAtomic,
    tradingFee: { policyName: 'trading_fee', policyVersionId: String(authorization.tradingFeePolicyVersionId ?? '0'), amountAtomic: authorization.tradingFeeAmountAtomic },
    deadlineUnix: Number(authorization.deadline),
  };
}
export async function prepareUsdcPrediction(input: PrepareUsdcPredictionInput): Promise<PreparedUsdcPrediction> {
  if (input.venue.chain_family !== 'EVM' || input.venue.evm_chain_id == null) throw new Error('This USDC network is not available through the EVM settlement flow.');
  const verifiedWallets = await ensureDynamicWalletConnectionsVerified();
  const wallet = chooseDynamicEvmWallet(verifiedWallets);
  const idempotencyKey = ['usdc', input.marketId, input.outcomeCode, input.venue.chain_code, Date.now(), Math.random().toString(36).slice(2)].join(':');
  const authorization = await prepareOnchainPrediction({ walletId: wallet.wallet_id, marketId: input.marketId, outcomeCode: input.outcomeCode, chainCode: input.venue.chain_code, amount: input.amount, idempotencyKey });
  const execution: EvmLockExecution = {
    network: { chainCode: authorization.chainCode, networkId: String(authorization.evmChainId), contractAddress: authorization.contractAddress, settlementTokenAddress: authorization.tokenAddress },
    authorization: toLockAuthorization(authorization), vadSignature: authorization.signature, approvalRequired: true,
  };
  return {
    intentId: authorization.intentId, marketId: input.marketId, outcomeCode: input.outcomeCode, chainCode: authorization.chainCode,
    walletId: wallet.wallet_id, walletAddress: authorization.walletAddress, collateralAmount: authorization.collateralAmount,
    tradingFee: authorization.tradingFee, maximumWalletDebit: Number(authorization.collateralAmount) + Number(authorization.tradingFee),
    expiresAtUnix: Number(authorization.deadline), authorization, execution,
  } satisfies PreparedUsdcPrediction;
}
export async function submitPreparedUsdcPrediction(prepared: PreparedUsdcPrediction): Promise<SubmittedUsdcPrediction> {
  let lockTransactionHash: string | null = null;
  try {
    const submitted = await submitEvmPositionLock(prepared.execution);
    lockTransactionHash = submitted.transactionHash;
    const recorded = await recordOnchainSubmission({ intentId: prepared.intentId, transactionId: lockTransactionHash });
    return { intentId: prepared.intentId, chainCode: prepared.chainCode, approvalTransactionHash: submitted.approvalTransactionHash, transactionHash: lockTransactionHash, status: recorded.intentStatus };
  } catch (reason) {
    if (!lockTransactionHash) {
      try { await failOnchainIntent(prepared.intentId, 'CLIENT_TRANSACTION_FAILED'); } catch { /* preserve original error */ }
    }
    throw reason;
  }
}
export async function cancelPreparedUsdcPrediction(prepared: PreparedUsdcPrediction | null, failureCode = 'USER_EDITED_AUTHORIZATION'): Promise<void> {
  if (prepared) await failOnchainIntent(prepared.intentId, failureCode);
}
