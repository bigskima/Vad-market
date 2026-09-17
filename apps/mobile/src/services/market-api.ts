import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type MarketCatalogItem = {
  instrument_public_id: string;
  event_public_id: string;
  title: string;
  category: string | null;
  asset_code: string;
  market_type: string;
  status: string;
  opens_at?: string | null;
  closes_at: string | null;
  resolves_after?: string | null;
  media_path?: string | null;
  yes_price: number | string | null;
  no_price: number | string | null;
  yes_volume?: number | string | null;
  no_volume?: number | string | null;
  total_volume?: number | string | null;
  participant_count?: number | string | null;
  last_trade_at: string | null;
  liquidity_mode?: string | null;
  reference_price?: number | string | null;
  resolution_status?: string | null;
  resolution_outcome?: string | null;
  resolution_finalized_at?: string | null;
  updated_at: string;
};

export type TradeQuote = {
  instrumentPublicId: string;
  instrumentId: number;
  outcomeId: number;
  outcomeCode: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  notional: number;
  settlementUnit: number;
  potentialGrossSettlement: number;
  makerFee: number;
  takerFee: number;
  maximumFeeReserve: number;
  maximumCashReservation: number;
  availableSharesToSell: number;
  quotedAt: string;
};

export type PoolQuote = {
  instrumentPublicId: string;
  instrumentId: number;
  outcomeId: number;
  outcomeCode: 'YES' | 'NO';
  assetId: number;
  amount: number | string;
  tradingFee: number | string;
  maximumCashDebit: number | string;
  poolTotalBefore: number | string;
  outcomePoolBefore: number | string;
  poolTotalAfter: number | string;
  outcomePoolAfter: number | string;
  impliedProbability: number | string;
  estimatedGrossPayout: number | string;
  estimatedSettlementFee: number | string;
  estimatedNetPayout: number | string;
  quotedAt: string;
};

export type PoolStakeStatus = {
  stakeId: string;
  marketId: string;
  outcomeCode: 'YES' | 'NO';
  amount: number | string;
  tradingFee: number | string;
  status: 'COMMITTED' | string;
};

export type PoolStakeRow = {
  stake_id: string;
  market_id: string;
  market_title: string;
  outcome_code: string;
  asset_code: string;
  amount: number | string;
  trading_fee: number | string;
  market_status: string;
  final_outcome: string | null;
  created_at: string;
};

export type MarketHistoryRow = {
  market_id: string;
  market_title: string;
  selected_outcome: string;
  final_outcome: string | null;
  asset_code: string;
  matched_quantity: number | string;
  stake_amount: number | string;
  trading_fee: number | string;
  gross_payout: number | string;
  settlement_fee: number | string;
  net_payout: number | string;
  realized_pnl: number | string;
  result: 'WON' | 'LOST' | 'REFUNDED' | 'VOID' | 'SETTLING' | 'PENDING' | string;
  settled_at: string | null;
};

export type WalletActivityRow = {
  activity_id: string;
  asset_code: string;
  activity_type: string;
  direction: 'DEBIT' | 'CREDIT' | string;
  amount: number | string;
  account_type: string;
  market_id: string | null;
  market_title: string | null;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
};

export type OrderStatus = {
  orderId: string;
  status: string;
  side: string;
  outcomeCode: string;
  assetCode: string;
  quantity: number | string;
  filledQuantity: number | string;
  remainingQuantity: number | string;
  positionQuantity: number | string;
  positionCreated: boolean;
  liquidityMode: string;
  updatedAt: string;
};

export type WalletRow = {
  asset_code: string;
  available: number | string;
  reserved: number | string;
  withdrawal_pending: number | string;
};

export type PositionRow = {
  instrument_id: string;
  event_id: string;
  market_title: string;
  outcome_code: string;
  asset_code: string;
  quantity: number | string;
  total_cost_basis: number | string;
  average_price: number | string;
  status: string;
};

export type OrderRow = {
  order_id: string;
  market_id: number;
  instrument_public_id: string;
  market_title: string;
  outcome_id: number;
  outcome_code: string;
  side: string;
  limit_price: number | string;
  quantity: number | string;
  filled_quantity: number | string;
  remaining_quantity: number | string;
  asset_code: string;
  status: string;
  created_at: string;
};

export type SettlementReceiptRow = {
  settlement_id: string;
  market_id: string;
  market_title: string;
  outcome_code: string;
  asset_code: string;
  quantity: number | string;
  gross_amount: number | string;
  fee_amount: number | string;
  net_amount: number | string;
  settled_at: string;
};

export type MarketAdmissionLane =
  | 'AUTO_PUBLISHED'
  | 'UNDER_REVIEW'
  | 'NEEDS_CLARIFICATION'
  | 'MERGED';

export type ProposalRow = {
  public_id: string;
  question: string;
  context: string | null;
  category: string | null;
  status: string;
  confidence: number | null;
  admission_lane: MarketAdmissionLane | null;
  admission_confidence: number | string | null;
  decision_reason: string | null;
  published_instrument_public_id: string | null;
  clarification_questions: string[] | null;
  risk_flags: string[] | null;
  created_at: string;
  updated_at: string;
};

export type MarketAdmissionResult = {
  proposalId: string;
  lane: MarketAdmissionLane;
  status: string;
  reason: string;
  runId: string;
  published: boolean;
  instrumentId?: string | null;
  eventId?: string | null;
  clarificationQuestions?: string[];
  riskFlags?: string[];
};

export type MarketAdmissionResponse = {
  proposalId: string;
  admission: MarketAdmissionResult;
  ai?: {
    attempted?: boolean;
    providerCode?: string;
    modelCode?: string;
    failoverCount?: number;
    reason?: string;
  };
};

function assertNoError(
  error: { message: string; code?: string; details?: string; hint?: string } | null,
  context: 'markets' | 'trading' | 'portfolio' | 'proposal' = 'markets',
  fallback?: string,
) {
  if (error) throw userFacingError(error, context, fallback);
}

export async function listMarkets() {
  const { data, error } = await supabase.from('market_catalog').select('*').order('updated_at', { ascending: false });
  assertNoError(error, 'markets');
  return (data ?? []) as MarketCatalogItem[];
}

export async function getWalletSummary() {
  const { data, error } = await supabase.rpc('my_wallet_summary');
  assertNoError(error, 'portfolio', 'We could not load your wallet balances right now. Please try again.');
  return (data ?? []) as WalletRow[];
}

export async function getWalletActivity(limit = 100) {
  const { data, error } = await supabase.rpc('my_wallet_activity', { p_limit: limit });
  assertNoError(error, 'portfolio', 'We could not load your complete wallet activity right now. Please try again.');
  return (data ?? []) as WalletActivityRow[];
}

export async function getPositions() {
  const { data, error } = await supabase.rpc('my_positions');
  assertNoError(error, 'portfolio');
  return (data ?? []) as PositionRow[];
}

export async function getOpenOrders() {
  const { data, error } = await supabase.rpc('my_open_orders');
  assertNoError(error, 'portfolio', 'We could not load your open orders right now. Please try again.');
  return (data ?? []) as OrderRow[];
}

export async function getPoolStakes() {
  const { data, error } = await supabase.rpc('my_pool_stakes');
  assertNoError(error, 'portfolio', 'We could not load your committed predictions right now. Please try again.');
  return (data ?? []) as PoolStakeRow[];
}

export async function getMarketHistory() {
  const { data, error } = await supabase.rpc('my_market_history');
  assertNoError(error, 'portfolio', 'We could not load your settled market history right now. Please try again.');
  return (data ?? []) as MarketHistoryRow[];
}

export async function getSettlementReceipts() {
  const { data, error } = await supabase.rpc('my_settlement_receipts');
  assertNoError(error, 'portfolio', 'We could not load your payout history right now. Please try again.');
  return (data ?? []) as SettlementReceiptRow[];
}

export async function getMyProposals() {
  const { data, error } = await supabase.rpc('my_market_proposals');
  assertNoError(error, 'proposal', 'We could not load your market proposals right now. Please try again.');
  return (data ?? []) as ProposalRow[];
}

export async function quotePoolStake(input: { instrumentPublicId: string; outcomeCode: 'YES' | 'NO'; amount: number }) {
  const { data, error } = await supabase.rpc('pool_quote', {
    p_instrument_public_id: input.instrumentPublicId,
    p_outcome_code: input.outcomeCode,
    p_amount: input.amount,
  });
  assertNoError(error, 'trading', 'We could not prepare this prediction right now. Please try again.');
  return data as PoolQuote;
}

export async function placePoolStake(quote: PoolQuote) {
  const idempotencyKey = `pool:${quote.instrumentPublicId}:${quote.outcomeCode}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const { data, error } = await supabase.rpc('place_pool_stake', {
    p_instrument_public_id: quote.instrumentPublicId,
    p_outcome_code: quote.outcomeCode,
    p_amount: Number(quote.amount),
    p_idempotency_key: idempotencyKey,
  });
  assertNoError(error, 'trading', 'We could not commit this prediction right now. Please try again.');
  return data as PoolStakeStatus;
}

export async function quoteTrade(input: { instrumentPublicId: string; outcomeCode: 'YES' | 'NO'; side: 'BUY' | 'SELL'; price: number; quantity: number }) {
  const { data, error } = await supabase.rpc('trade_quote', {
    p_instrument_public_id: input.instrumentPublicId,
    p_outcome_code: input.outcomeCode,
    p_side: input.side,
    p_price: input.price,
    p_quantity: input.quantity,
  });
  assertNoError(error, 'trading', 'We could not prepare this trade right now. Please try again.');
  return data as TradeQuote;
}

export async function getOrderStatus(orderPublicId: string) {
  const { data, error } = await supabase.rpc('my_order_status', {
    p_order_public_id: orderPublicId,
  });
  assertNoError(error, 'trading', 'We could not confirm this order status right now. Check Portfolio for the latest state.');
  return data as OrderStatus;
}

export async function placeOrder(quote: TradeQuote) {
  const idempotencyKey = `mobile:${quote.instrumentPublicId}:${quote.outcomeCode}:${quote.side}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const { data, error } = await supabase.rpc('place_order', {
    p_market_id: quote.instrumentId,
    p_outcome_id: quote.outcomeId,
    p_side: quote.side,
    p_price: quote.price,
    p_quantity: quote.quantity,
    p_idempotency_key: idempotencyKey,
  });
  assertNoError(error, 'trading');
  const orderId = data as string;
  return getOrderStatus(orderId);
}

export async function cancelOrder(orderPublicId: string) {
  const { data, error } = await supabase.rpc('cancel_order', { p_order_public_id: orderPublicId });
  assertNoError(error, 'trading', 'We could not cancel this order right now. Please try again.');
  return Boolean(data);
}

export async function submitMarketProposal(input: {
  question: string;
  context?: string;
  category?: string;
  assetCode?: string;
}) {
  const { data, error } = await supabase.functions.invoke('market-admission', {
    body: {
      question: input.question.trim(),
      context: input.context?.trim() || null,
      category: input.category?.trim() || null,
      assetCode: input.assetCode?.trim().toUpperCase() || null,
    },
  });

  if (error) throw userFacingError(error, 'proposal');
  const payload = data as Partial<MarketAdmissionResponse> & { error?: string; message?: string };
  if (payload.error || !payload.admission) {
    throw userFacingError(payload.message ?? payload.error, 'proposal');
  }
  return payload as MarketAdmissionResponse;
}

export async function getAdminRuntimeSummary() {
  const { data, error } = await supabase.rpc('admin_runtime_summary');
  if (error) return null;
  return data as Record<string, number | string>;
}
export async function getAdminMarketQueue() {
  const { data, error } = await supabase.rpc('admin_market_queue');
  if (error) return [];
  return (data ?? []) as Record<string, unknown>[];
}
export async function getAdminOracleQueue() {
  const { data, error } = await supabase.rpc('admin_oracle_queue');
  if (error) return [];
  return (data ?? []) as Record<string, unknown>[];
}
