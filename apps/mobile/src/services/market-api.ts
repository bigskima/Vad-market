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
  const { data, error } = await supabase.from('market_catalog').select('*').order('updated_at', { ascending: false });
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
  return data as PublishedMarketDetail;
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


type MarketTradingContext = {
  instrument_public_id: string;
  asset_code: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  resolves_after: string | null;
  resolution_status: string | null;
  liquidity_mode: string | null;
};

async function requireMarketTradingContext(
  instrumentPublicId: string,
  expectedMode: 'POOL' | 'ORDER_BOOK',
): Promise<MarketTradingContext> {
  const { data, error } = await supabase
    .from('market_catalog')
    .select('instrument_public_id,asset_code,status,opens_at,closes_at,resolves_after,resolution_status,liquidity_mode')
    .eq('instrument_public_id', instrumentPublicId)
    .maybeSingle();
  assertNoError(error, 'trading', 'We could not verify this market and its trading window. Refresh and try again.');
  if (!data) throw new Error('This market is no longer available. Refresh the market page and try again.');

  const context = data as MarketTradingContext;
  const assetCode = String(context.asset_code ?? '').toUpperCase();
  if (assetCode === 'TNGN') {
    throw new Error('TNGN has been permanently retired. Historical TNGN markets cannot accept new trades.');
  }
  if (assetCode !== 'NGN' && assetCode !== 'USDC') {
    throw new Error('This market asset is not enabled for trading.');
  }

  const mode = String(context.liquidity_mode ?? '').toUpperCase();
  const usesPool = mode.includes('POOL');
  if (expectedMode === 'POOL' && !usesPool) {
    throw new Error('This is an order-book market, not a pooled-stake market. Refresh the page to load the correct trading ticket.');
  }
  if (expectedMode === 'ORDER_BOOK' && usesPool) {
    throw new Error('This market uses pooled staking, not limit orders. Refresh the page to load the correct trading ticket.');
  }

  const status = String(context.status ?? '').toUpperCase();
  if (status !== 'OPEN' && status !== 'ACTIVE') {
    const label = status === 'SCHEDULED' ? 'has not opened yet'
      : status === 'SETTLED' || status === 'CLOSED' ? 'is closed'
        : status === 'SUSPENDED' ? 'is paused'
          : 'is not accepting trades';
    throw new Error(`This market ${label}. Check its published trading schedule and try again when trading is open.`);
  }

  const now = Date.now();
  const opensAt = context.opens_at ? Date.parse(context.opens_at) : null;
  const closesAt = context.closes_at ? Date.parse(context.closes_at) : null;
  const resolvesAt = context.resolves_after ? Date.parse(context.resolves_after) : null;

  if (context.opens_at && opensAt != null && Number.isFinite(opensAt) && now < opensAt) {
    throw new Error(`This market opens at ${new Date(opensAt).toLocaleString()}. You can review a prediction after it opens.`);
  }
  if (expectedMode === 'POOL' && (opensAt == null || !Number.isFinite(opensAt))) {
    throw new Error('This pooled market has no valid opening time configured. New stakes are paused until its schedule is corrected.');
  }
  if (context.closes_at && closesAt != null && Number.isFinite(closesAt) && now >= closesAt) {
    throw new Error('This market has reached its published closing time. New trades are no longer accepted.');
  }
  if (context.resolves_after && resolvesAt != null && Number.isFinite(resolvesAt) && now >= resolvesAt) {
    throw new Error('This market has reached its result-check time. New trades are paused while the result is processed.');
  }

  return context;
}

async function ensureNgnLocationForAsset(assetCode: string) {
  if (assetCode !== 'NGN') return;
  const result = await verifyCurrentServiceLocation().catch(() => ({
    allowed: false,
    reasonCode: 'LOCATION_VERIFICATION_UNAVAILABLE',
  }));
  if (result.allowed) return;

  const messages: Record<string, string> = {
    LOCATION_PERMISSION_REQUIRED: 'Allow VAD to access your device location, then try the NGN quote again.',
    LOCATION_INACCURATE: 'Your device location is too imprecise to verify NGN trading. Improve location accuracy and retry.',
    LOCATION_CHECK_EXPIRED: 'Your Nigerian location verification has expired. Verify your current location again before trading.',
    LOCATION_MISMATCH: 'Your device and network location do not both verify as Nigeria. NGN trading is blocked until they match.',
    NETWORK_RISK: 'NGN trading is blocked because the current network could not be verified as a permitted Nigerian connection.',
    ACCOUNT_NOT_ELIGIBLE: 'This account is not eligible for NGN trading.',
    LOCATION_VERIFICATION_UNAVAILABLE: 'VAD could not verify your current Nigerian location. Check location permission and your network, then retry.',
  };
  throw new Error(messages[result.reasonCode] ?? 'NGN trading requires a current verified location in Nigeria.');
}

function marketTradeError(error: unknown, fallback: string) {
  const raw = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : '';
  const message = raw.toLowerCase();
  if (message.includes('market is not open')) {
    return new Error('This market is outside its published trading window. Check its opening and closing times before trying again.');
  }
  if (message.includes('stake is below the market minimum') || message.includes('below market minimum notional')) {
    return new Error('Your amount is below this market’s minimum stake/order value.');
  }
  if (message.includes('trading is not available for this account and market')) {
    return new Error('NGN trading requires an active eligible account and a current verified Nigerian location/network.');
  }
  if (message.includes('does not use pooled staking')) {
    return new Error('This market is configured for order-book trading. Refresh the market page to load its correct ticket.');
  }
  if (message.includes('uses peer-funded pooled staking')) {
    return new Error('This market is configured for pooled staking. Refresh the market page to load its correct ticket.');
  }
  return userFacingError(error, 'trading', fallback);
}

export async function quotePoolStake(input: { instrumentPublicId: string; outcomeCode: 'YES' | 'NO'; amount: number }) {
  const context = await requireMarketTradingContext(input.instrumentPublicId, 'POOL');
  await ensureNgnLocationForAsset(context.asset_code);
  const { data, error } = await supabase.rpc('pool_quote', {
    p_instrument_public_id: input.instrumentPublicId,
    p_outcome_code: input.outcomeCode,
    p_amount: input.amount,
  });
  if (error) throw marketTradeError(error, 'We could not prepare this prediction right now. Please retry.');
  return data as PoolQuote;
}

export async function placePoolStake(quote: PoolQuote) {
  const context = await requireMarketTradingContext(quote.instrumentPublicId, 'POOL');
  await ensureNgnLocationForAsset(context.asset_code);
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
  const context = await requireMarketTradingContext(input.instrumentPublicId, 'ORDER_BOOK');
  await ensureNgnLocationForAsset(context.asset_code);
  const { data, error } = await supabase.rpc('trade_quote', {
    p_instrument_public_id: input.instrumentPublicId,
    p_outcome_code: input.outcomeCode,
    p_side: input.side,
    p_price: input.price,
    p_quantity: input.quantity,
  });
  if (error) throw marketTradeError(error, 'We could not prepare this trade right now. Please retry.');
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
  const context = await requireMarketTradingContext(quote.instrumentPublicId, 'ORDER_BOOK');
  await ensureNgnLocationForAsset(context.asset_code);
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
