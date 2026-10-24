import type { OnchainPositionLockAuthorization } from '@vad/chain-core';

import type {
  OnchainMarketVenue,
  SignedOnchainPredictionAuthorization,
} from '@/services/onchain-api';
import type { EvmLockExecution } from '@/services/settlement-wallet';

export type PreparedUsdcPrediction = {
  intentId: string;
  marketId: string;
  outcomeCode: string;
  chainCode: string;
  walletId: string;
  walletAddress: string;
  collateralAmount: number | string;
  tradingFee: number | string;
  maximumWalletDebit: number;
  expiresAtUnix: number;
  authorization: SignedOnchainPredictionAuthorization;
  execution: EvmLockExecution;
};

export type PrepareUsdcPredictionInput = {
  marketId: string;
  outcomeCode: string;
  amount: number;
  venue: OnchainMarketVenue;
};

export type SubmittedUsdcPrediction = {
  intentId: string;
  chainCode: string;
  approvalTransactionHash: string | null;
  transactionHash: string;
  status: string;
};

export type PositionLockAuthorization = OnchainPositionLockAuthorization;
