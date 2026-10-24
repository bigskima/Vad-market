import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';
import { verifyCurrentServiceLocation } from '@/services/location-eligibility';

export type MarketCatalogItem = {
  instrument_public_id: string;
  event_public_id: string;
  title: string;
  category: string | null;
  category_code?: string | null;
  presentation_profile?: 'EVENT' | 'CRYPTO' | 'SPORTS' | 'MUSIC' | 'AI' | 'STOCKS' | 'ECONOMICS' | 'ENTERTAINMENT' | 'PUBLIC_EVENTS' | string | null;
  group_key?: string | null;
  market_context?: Record<string, unknown> | null;
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

export type WalletBalanceHistoryRow = {
  observed_on: string;
  asset_code: string;
  balance: number | string;
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

export type PortfolioOrderHistoryRow = {
  order_id: string;
  instrument_id: string;
  market_title: string;
  outcome_code: string;
  asset_code: string;
  side: string;
  limit_price: number | string;
  quantity: number | string;
  filled_quantity: number | string;
  remaining_quantity: number | string;
  status: string;
  created_at: string;
  updated_at: string;
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

export type PortfolioPositionMarkRow = {
  instrument_id: string;
  event_id: string;
  market_title: string;
  outcome_code: string;
  asset_code: string;
  quantity: number | string;
  total_cost_basis: number | string;
  fees_paid: number | string;
  average_price: number | string;
  market_status: string;
  current_price: number | string | null;
  current_value: number | string | null;
  unrealized_pnl: number | string | null;
  return_percentage: number | string | null;
  marked_at: string | null;
  mark_status: 'MARKED' | 'STALE' | 'UNPRICED' | 'SETTLED' | 'UNAVAILABLE' | string;
  media_path: string | null;
};

export type PortfolioValuationSnapshotRow = {
  snapshot_id: number;
  observed_at: string;
  asset_code: string;
  cash_balance: number | string;
  positions_value: number | string;
  total_value: number | string | null;
  valuation_complete: boolean;
  open_position_count: number;
  unpriced_position_count: number;
  net_external_flow: number | string;
};

export function marketMediaUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('https://') || path.startsWith('http://')) return path;
  return supabase.storage.from('market-media').getPublicUrl(path).data.publicUrl;
}

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
  // Historical TNGN records remain in the database for audit, but TNGN is
  // fully retired and must never re-enter the live market catalogue.
  const { data, error } = await supabase
    .from('market_catalog')
    .select('*')
    .neq('asset_code', 'TNGN')
    .order('updated_at', { ascending: false });
  assertNoError(error, 'markets');
  return (data ?? []) as MarketCatalogItem[];
}

export type PublishedMarketDetail = {
  instrumentId: string;
  eventId: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  assetCode: string;
  settlementUnit: number | string | null;
  minimumOrderNotional: number | string | null;
  opensAt: string | null;
  closesAt: string | null;
  resolvesAfter: string | null;
  mediaPath: string | null;
  resolutionScope: Record<string, unknown> | null;
  outcomes: Array<{
    id: number;
    code: string;
    label: string;
    displayOrder: number;
  }>;
  oracle: {
    policyId: string;
    policyName: string;
    policyVersion: number;
    sourceHierarchy: Array<{ role: string; provider_code: string }>;
    consensusRule: Record<string, unknown> | null;
    closeRule: Record<string, unknown> | null;
    postponementRule: Record<string, unknown> | null;
    cancellationRule: Record<string, unknown> | null;
    voidRule: Record<string, unknown> | null;
    disputeWindowSeconds: number | null;
  } | null;
};

export async function getPublishedMarketDetail(instrumentPublicId: string): Promise<PublishedMarketDetail> {
  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error('We could not verify your sign-in session. Please retry.');
  if (!sessionResult.session) {
    throw new Error('Sign in to view the full published criteria and resolution policy.');
  }

  const { data, error } = await supabase.rpc('market_detail', {
    p_instrument_public_id: instrumentPublicId,
  });
  assertNoError(error, 'markets', 'We could not load the published resolution details right now.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Published market details are not available for this market.');
  }
  const detail = data as PublishedMarketDetail;
  if (String(detail.assetCode ?? '').toUpperCase() === 'TNGN') {
    throw new Error('This market is no longer available.');
  }
  return detail;
}

export async function getWalletBalanceHistory(days = 30) {
  const { data, error } = await supabase.rpc('my_wallet_balance_history', {
    p_days: Math.max(7, Math.min(90, Math.floor(days))),
  });
  assertNoError(error, 'portfolio', 'We could not load your wallet balance history right now. Please try again.');
  return (data ?? []) as WalletBalanceHistoryRow[];
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

export async function getPortfolioOrderHistory(limit = 100) {
  const { data, error } = await supabase.rpc('my_portfolio_order_history', {
    p_limit: limit,
  });
  assertNoError(error, 'portfolio', 'We could not load your order history right now. Please try again.');
  return (data ?? []) as PortfolioOrderHistoryRow[];
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

export async function getPortfolioPositionMarks() {
  const { data, error } = await supabase.rpc('my_portfolio_position_marks');
  assertNoError(error, 'portfolio', 'We could not load current position valuations. Please try again.');
  return (data ?? []) as PortfolioPositionMarkRow[];
}

export async function getPortfolioValuationHistory(days = 3650, limit = 600) {
  const { data, error } = await supabase.rpc('my_portfolio_valuation_history', {
    p_days: days,
    p_limit: limit,
  });
  assertNoError(error, 'portfolio', 'We could not load portfolio performance history. Please try again.');
  return (data ?? []) as PortfolioValuationSnapshotRow[];
}

export async function getMyProposals() {
  const { data, error } = await supabase.rpc('my_market_proposals');
  assertNoError(error, 'proposal', 'We could not load your market proposals right now. Please try again.');
  return (data ?? []) as ProposalRow[];
}


async function ensureNgnLocationForInstrument(instrumentPublicId: string) {
  const { data, error } = await supabase
    .from('market_catalog')
    .select('asset_code')
    .eq('instrument_public_id', instrumentPublicId)
    .maybeSingle();
  assertNoError(error, 'trading', 'We could not verify the market currency. Please try again.');
  if (data?.asset_code !== 'NGN') return;

  const result = await verifyCurrentServiceLocation().catch(() => ({
    allowed: false,
    reasonCode: 'LOCATION_VERIFICATION_UNAVAILABLE',
  }));
  if (!result.allowed) {
    throw new Error('NGN trading is available only when your current location and network are verified in Nigeria.');
  }
}

async function getMarketAssetCode(instrumentPublicId: string) {
  const { data, error } = await supabase
    .from('market_catalog')
    .select('asset_code')
    .eq('instrument_public_id', instrumentPublicId)
    .maybeSingle();
  assertNoError(error, 'trading', 'We could not verify this market currency. Please try again.');
  return data?.asset_code ?? null;
}

function tradingErrorMessage(error: { message: string; code?: string } | null, fallback: string) {
  const message = String(error?.message ?? '').toLowerCase();
  if (message.includes('location verification') || message.includes('current location') || message.includes('network are verified')) {
    return 'NGN trading requires current Nigeria location and network verification. Complete the location check in your account, then retry. Temporary test credit does not bypass this requirement.';
  }
  if (message.includes('trading is not available for this account and market')) {
    return 'This account is not currently eligible to trade this market. For NGN testing, confirm your current Nigeria location is verified and that the market is open.';
  }
  if (message.includes('market is not open')) {
    return 'This market is no longer open for new trades. Choose an OPEN market; settled markets remain viewable but cannot accept stakes.';
  }
  if (message.includes('temporary test credit cannot join') || message.includes('restricted to non-cash test-credit trading')) {
    return 'This market cannot mix temporary test funds with cash-funded stakes. Choose an eligible OPEN NGN market with no existing real-money exposure.';
  }
  if (message.includes('below the market minimum') || message.includes('below market minimum')) {
    return 'The stake is below this market’s minimum. Increase the amount and review the quote again.';
  }
  if (message.includes('insufficient available balance')) {
    return 'Your available NGN balance does not cover the stake and trading fee.';
  }
  return fallback;
}

export async function quotePoolStake(input: { instrumentPublicId: string; outcomeCode: 'YES' | 'NO'; amount: number }) {
  const assetCode = await getMarketAssetCode(input.instrumentPublicId);
  if (assetCode !== 'NGN' && assetCode !== 'USDC') {
    throw new Error('TNGN markets are permanently retired. Select a real NGN or supported USDC market.');
  }
  // Validate the real-time location before quoting, so the user sees the actual
  // prerequisite instead of the generic "Prediction review unavailable" fallback.
  await ensureNgnLocationForInstrument(input.instrumentPublicId);
  const { data, error } = await supabase.rpc('pool_quote', {
    p_instrument_public_id: input.instrumentPublicId,
    p_outcome_code: input.outcomeCode,
    p_amount: input.amount,
  });
  if (error) {
    throw new Error(tradingErrorMessage(error, 'We could not prepare this prediction right now. Please retry after checking account eligibility and market status.'));
  }
  return data as PoolQuote;
}

export async function placePoolStake(quote: PoolQuote) {
  const assetCode = await getMarketAssetCode(quote.instrumentPublicId);
  if (assetCode !== 'NGN' && assetCode !== 'USDC') {
    throw new Error('TNGN markets are permanently retired. Select a real NGN or supported USDC market.');
  }
  await ensureNgnLocationForInstrument(quote.instrumentPublicId);
  const idempotencyKey = `pool:${quote.instrumentPublicId}:${quote.outcomeCode}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const { data, error } = await supabase.rpc('place_pool_stake', {
    p_instrument_public_id: quote.instrumentPublicId,
    p_outcome_code: quote.outcomeCode,
    p_amount: Number(quote.amount),
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    throw new Error(tradingErrorMessage(error, 'We could not commit this prediction right now. Check your location, available balance and whether the market is still OPEN.'));
  }
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
  await ensureNgnLocationForInstrument(quote.instrumentPublicId);
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

export type MarketOrderBookLevel = { price: number | string; quantity: number | string };
export type MarketOrderBook = {
  instrumentId: string;
  yesBids: MarketOrderBookLevel[];
  noBids: MarketOrderBookLevel[];
};

export async function getMarketOrderBook(instrumentPublicId: string) {
  const { data, error } = await supabase.rpc('order_book', {
    p_instrument_public_id: instrumentPublicId,
  });
  assertNoError(error, 'markets', 'We could not load the live order book right now.');
  const payload = (data ?? {}) as Partial<MarketOrderBook>;
  return {
    instrumentId: String(payload.instrumentId ?? instrumentPublicId),
    yesBids: Array.isArray(payload.yesBids) ? payload.yesBids : [],
    noBids: Array.isArray(payload.noBids) ? payload.noBids : [],
  } as MarketOrderBook;
}

export type MarketPriceHistoryPoint = {
  observed_at: string;
  outcome_code: 'YES' | 'NO' | string;
  price: number | string;
};

export async function getMarketPriceHistory(instrumentPublicId: string, limit = 120) {
  const { data, error } = await supabase.rpc('market_price_history', {
    p_instrument_public_id: instrumentPublicId,
    p_limit: limit,
  });
  assertNoError(error, 'markets', 'We could not load executed market prices right now.');
  return (Array.isArray(data) ? data : []) as MarketPriceHistoryPoint[];
}

export async function getPeerPoolStakeHistory(instrumentPublicId: string, limit = 120) {
  const { data, error } = await supabase.rpc('peer_pool_stake_history', {
    p_instrument_public_id: instrumentPublicId,
    p_limit: limit,
  });
  assertNoError(error, 'markets', 'We could not load historical participant allocation right now.');
  return (Array.isArray(data) ? data : []) as MarketPriceHistoryPoint[];
}
