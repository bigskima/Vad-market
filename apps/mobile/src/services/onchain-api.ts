import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type OnchainTransactionIntentRow = {
  intent_id: string;
  action: 'PREDICT' | 'CLAIM' | 'REFUND';
  status:
    | 'CREATED'
    | 'AWAITING_SIGNATURE'
    | 'SIGNED'
    | 'SUBMITTED'
    | 'CONFIRMING'
    | 'CONFIRMED'
    | 'FAILED'
    | 'CANCELLED'
    | 'REPLACED'
    | 'DROPPED';
  chain_code: string;
  wallet_address: string;
  amount: number | string | null;
  outcome_label: string | null;
  transaction_id: string | null;
  transaction_status: 'SUBMITTED' | 'CONFIRMING' | 'CONFIRMED' | 'FAILED' | 'REPLACED' | 'DROPPED' | null;
  confirmations: number;
  finalized: boolean;
  failure_code: string | null;
  created_at: string;
  updated_at: string;
};

export async function getMyOnchainTransactionIntents(limit = 50) {
  const { data, error } = await supabase.rpc('my_onchain_transaction_intents', {
    p_limit: Math.max(1, Math.min(limit, 200)),
  });

  if (error) {
    throw userFacingError(
      error,
      'portfolio',
      'We could not load your on-chain activity right now.',
    );
  }

  return (data ?? []) as OnchainTransactionIntentRow[];
}


export type OnchainMarketVenue = {
  venue_id: string;
  chain_code: string;
  chain_name: string;
  chain_family: string;
  client_adapter: string;
  evm_chain_id: number | null;
  native_symbol: string;
  explorer_url: string | null;
  asset_code: string;
  token_standard: string;
  token_address: string;
  token_decimals: number;
  representation_type: string;
  protocol_key: string;
  protocol_version: number;
  contract_address: string;
};

export type SignedOnchainPredictionAuthorization = {
  intentId: string;
  intentStatus: string;
  authorizationId: string;
  authorizationStatus: string;
  positionId: string;
  marketId: string;
  outcomeId: string;
  walletAddress: string;
  collateralAmount: number | string;
  collateralAmountAtomic: string;
  tradingFee: number | string;
  tradingFeeAmountAtomic: string;
  tradingFeePolicyVersionId: number | string | null;
  deadline: number | string;
  chainCode: string;
  evmChainId: number | string;
  contractAddress: string;
  tokenAddress: string;
  tokenDecimals: number;
  expectedQuoteSigner: string;
  protocolKey: string;
  protocolVersion: number;
  signature: string;
  signerAddress?: string;
};

export async function listOnchainMarketVenues(instrumentPublicId: string) {
  const { data, error } = await supabase.rpc('my_market_onchain_venues', {
    p_instrument_public_id: instrumentPublicId,
  });

  if (error) {
    throw userFacingError(
      error,
      'trading',
      'We could not check the available USDC networks for this market.',
    );
  }

  return (data ?? []) as OnchainMarketVenue[];
}

function gatewayError(
  error: unknown,
  payload: { error?: string; message?: string } | null,
  fallback: string,
) {
  const message = payload?.message ?? payload?.error;
  if (message) return new Error(message);
  if (error instanceof Error) return error;
  return new Error(fallback);
}

export async function prepareOnchainPrediction(input: {
  walletId: string;
  marketId: string;
  outcomeCode: 'YES' | 'NO';
  chainCode: string;
  amount: number;
  idempotencyKey: string;
}) {
  const { data, error } = await supabase.functions.invoke('onchain-gateway', {
    body: {
      action: 'prepare_prediction',
      walletId: input.walletId,
      marketId: input.marketId,
      outcomeCode: input.outcomeCode,
      chainCode: input.chainCode,
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
    },
  });

  const payload = data as {
    ok?: boolean;
    authorization?: SignedOnchainPredictionAuthorization;
    error?: string;
    message?: string;
  } | null;

  if (error || !payload?.ok || !payload.authorization) {
    throw gatewayError(
      error,
      payload,
      'VAD could not prepare this USDC prediction.',
    );
  }

  return payload.authorization;
}

export async function recordOnchainSubmission(input: {
  intentId: string;
  transactionId: string;
}) {
  const { data, error } = await supabase.functions.invoke('onchain-gateway', {
    body: {
      action: 'record_submission',
      intentId: input.intentId,
      transactionId: input.transactionId,
    },
  });

  const payload = data as {
    ok?: boolean;
    submission?: {
      intentId: string;
      intentStatus: string;
      transactionId: string;
      transactionStatus: string;
      chainCode: string;
    };
    error?: string;
    message?: string;
  } | null;

  if (error || !payload?.ok || !payload.submission) {
    throw gatewayError(
      error,
      payload,
      'VAD could not record this on-chain transaction.',
    );
  }

  return payload.submission;
}

export async function failOnchainIntent(
  intentId: string,
  failureCode = 'CLIENT_TRANSACTION_FAILED',
) {
  const { data, error } = await supabase.functions.invoke('onchain-gateway', {
    body: {
      action: 'fail_intent',
      intentId,
      failureCode,
    },
  });

  const payload = data as { ok?: boolean; error?: string; message?: string } | null;
  if (error || !payload?.ok) {
    throw gatewayError(
      error,
      payload,
      'VAD could not close this unused on-chain authorization.',
    );
  }
}
