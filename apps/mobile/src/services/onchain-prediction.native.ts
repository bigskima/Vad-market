import type { OnchainPositionLockAuthorization } from '@vad/chain-core';

import {
  failOnchainIntent,
  prepareOnchainPrediction,
  recordOnchainSubmission,
  type OnchainMarketVenue,
  type SignedOnchainPredictionAuthorization,
} from '@/services/onchain-api';
import {
  submitEvmPositionLock,
  type EvmLockExecution,
} from '@/services/settlement-wallet.native';
import {
  ensureDynamicWalletConnectionsVerified,
  type VerifiedVadWallet,
} from '@/services/verified-wallet-api.native';

import type {
  PreparedUsdcPrediction,
  PrepareUsdcPredictionInput,
  SubmittedUsdcPrediction,
} from '@/services/onchain-prediction.types';

export type {
  PreparedUsdcPrediction,
  PrepareUsdcPredictionInput,
  SubmittedUsdcPrediction,
} from '@/services/onchain-prediction.types';

function chooseDynamicEvmWallet(wallets: VerifiedVadWallet[]) {
  const wallet = wallets.find(
    (candidate) =>
      candidate.chain_family === 'EVM' &&
      candidate.status === 'VERIFIED',
  );

  if (!wallet) {
    throw new Error(
      'A verified Dynamic EVM wallet is required before you can commit a USDC prediction.',
    );
  }

  return wallet;
}

function toLockAuthorization(
  authorization: SignedOnchainPredictionAuthorization,
): OnchainPositionLockAuthorization {
  return {
    authorizationId: authorization.authorizationId,
    positionId: authorization.positionId,
    marketId: authorization.marketId,
    outcomeId: authorization.outcomeId,
    userAddress: authorization.walletAddress,
    collateralAmountAtomic: authorization.collateralAmountAtomic,
    tradingFee: {
      policyName: 'trading_fee',
      policyVersionId: String(
        authorization.tradingFeePolicyVersionId ?? '0',
      ),
      amountAtomic: authorization.tradingFeeAmountAtomic,
    },
    deadlineUnix: Number(authorization.deadline),
  };
}

export async function prepareUsdcPrediction(
  input: PrepareUsdcPredictionInput,
): Promise<PreparedUsdcPrediction> {
  if (input.venue.chain_family !== 'EVM' || input.venue.evm_chain_id == null) {
    throw new Error(
      'This USDC network is not available through the native EVM settlement flow.',
    );
  }

  const verifiedWallets = await ensureDynamicWalletConnectionsVerified();
  const wallet = chooseDynamicEvmWallet(verifiedWallets);
  const idempotencyKey = [
    'usdc',
    input.marketId,
    input.outcomeCode,
    input.venue.chain_code,
    Date.now(),
    Math.random().toString(36).slice(2),
  ].join(':');

  const authorization = await prepareOnchainPrediction({
    walletId: wallet.wallet_id,
    marketId: input.marketId,
    outcomeCode: input.outcomeCode,
    chainCode: input.venue.chain_code,
    amount: input.amount,
    idempotencyKey,
  });

  const lockAuthorization = toLockAuthorization(authorization);
  const execution: EvmLockExecution = {
    network: {
      chainCode: authorization.chainCode,
      networkId: String(authorization.evmChainId),
      contractAddress: authorization.contractAddress,
      settlementTokenAddress: authorization.tokenAddress,
    },
    authorization: lockAuthorization,
    vadSignature: authorization.signature,
    // Exact approval keeps the initial sandbox path simple and avoids relying
    // on stale allowance data. Gas remains user-paid.
    approvalRequired: true,
  };

  return {
    intentId: authorization.intentId,
    marketId: input.marketId,
    outcomeCode: input.outcomeCode,
    chainCode: authorization.chainCode,
    walletId: wallet.wallet_id,
    walletAddress: authorization.walletAddress,
    collateralAmount: authorization.collateralAmount,
    tradingFee: authorization.tradingFee,
    maximumWalletDebit:
      Number(authorization.collateralAmount) +
      Number(authorization.tradingFee),
    expiresAtUnix: Number(authorization.deadline),
    authorization,
    execution,
  } satisfies PreparedUsdcPrediction;
}

export async function submitPreparedUsdcPrediction(
  prepared: PreparedUsdcPrediction,
): Promise<SubmittedUsdcPrediction> {
  let lockTransactionHash: string | null = null;

  try {
    const submitted = await submitEvmPositionLock(prepared.execution);
    lockTransactionHash = submitted.transactionHash;

    const recorded = await recordOnchainSubmission({
      intentId: prepared.intentId,
      transactionId: lockTransactionHash,
    });

    return {
      intentId: prepared.intentId,
      chainCode: prepared.chainCode,
      approvalTransactionHash: submitted.approvalTransactionHash,
      transactionHash: lockTransactionHash,
      status: recorded.intentStatus,
    };
  } catch (reason) {
    // Once the lock transaction has a hash it may already be on-chain. Never
    // mark that intent failed merely because the follow-up record call failed.
    if (!lockTransactionHash) {
      try {
        await failOnchainIntent(
          prepared.intentId,
          'CLIENT_TRANSACTION_FAILED',
        );
      } catch {
        // The original wallet/transaction error is more useful to the user.
      }
    }
    throw reason;
  }
}

export async function cancelPreparedUsdcPrediction(
  prepared: PreparedUsdcPrediction | null,
  failureCode = 'USER_EDITED_AUTHORIZATION',
) {
  if (!prepared) return;
  await failOnchainIntent(prepared.intentId, failureCode);
}
