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
  const realWallets = (data ?? []) as WalletRow[];

  // TNGN balance comes from demo_accounts, never finance.ledger_accounts.
  // Keep real wallet balances usable if the optional demo service is unavailable.
  try {
    const { data: statusData, error: statusError } = await supabase.rpc('get_demo_mode_status');
    const status = (Array.isArray(statusData) ? statusData[0] : statusData) as { user_enabled?: boolean } | null;
    if (!statusError && status?.user_enabled === true) {
      const { data: accountData, error: accountError } = await supabase.rpc('my_demo_account');
      const account = (Array.isArray(accountData) ? accountData[0] : accountData) as { availableBalance?: number | string } | null;
      if (!accountError && account) {
        return [
          ...realWallets.filter((wallet) => wallet.asset_code !== 'TNGN'),
          { asset_code: 'TNGN', available: Number(account.availableBalance ?? 0), reserved: 0, withdrawal_pending: 0 },
        ];
      }
    }
  } catch {
    // Demo balance is optional; never suppress the real wallet summary.
  }
  return realWallets;
}

export async function getWalletActivity(limit = 100) {
  const { data, error } = await supabase.rpc('my_wallet_activity', { p_limit: limit });
  assertNoError(error, 'portfolio', 'We could not load your complete wallet activity right now. Please try again.');
  const realActivity = (data ?? []) as WalletActivityRow[];

  // Demo entries are read from the isolated TNGN ledger, not from my_wallet_activity.
  try {
    const { data: statusData, error: statusError } = await supabase.rpc('get_demo_mode_status');
    const status = (Array.isArray(statusData) ? statusData[0] : statusData) as { user_enabled?: boolean } | null;
    if (!statusError && status?.user_enabled === true) {
      const { data: demoData, error: demoError } = await supabase.rpc('my_tngn_demo_ledger_activity', { p_limit: limit });
      if (!demoError) {
        const demoActivity = (demoData ?? []) as WalletActivityRow[];
        return [...demoActivity, ...realActivity]
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .slice(0, Math.max(1, limit));
      }
    }
  } catch {
    // Keep the real ledger activity visible if the isolated demo-ledger read fails.
  }
  return realActivity;
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
  const standardRows = (data ?? []) as PoolStakeRow[];
  const { data: policy, error: policyError } = await supabase.rpc('get_my_currency_policy');
  assertNoError(policyError, 'portfolio', 'We could not verify your enabled trading currencies.');
  const enabledAssets = Array.isArray(policy)
    ? policy.flatMap((row: { enabled_asset_codes?: string[] }) => row.enabled_asset_codes ?? [])
    : [];
  if (!enabledAssets.includes('TNGN')) return standardRows;

  const { data: tngnRows, error: tngnError } = await supabase.rpc('my_tngn_market_orders');
  assertNoError(tngnError, 'portfolio', 'We could not load your TNGN prediction history.');
  const isolatedRows = ((tngnRows ?? []) as Array<{
    orderId: string; marketId: string; marketTitle: string; outcomeCode: string;
    stake: number | string; status: string; finalOutcome: string | null; createdAt: string;
  }>).map((row) => ({
    stake_id: row.orderId,
    market_id: row.marketId,
    market_title: row.marketTitle,
    outcome_code: row.outcomeCode,
    asset_code: 'TNGN',
    amount: row.stake,
    trading_fee: 0,
    market_status: row.status,
    final_outcome: row.finalOutcome,
    created_at: row.createdAt,
  } satisfies PoolStakeRow));
  return [...isolatedRows, ...standardRows];
}

export async function getMarketHistory() {
  const { data, error } = await supabase.rpc('my_market_history');
  assertNoError(error, 'portfolio', 'We could not load your settled market history right now. Please try again.');
  const realHistory = (data ?? []) as MarketHistoryRow[];

  // Resolve TNGN outcomes from the isolated demo-order ledger. These rows never
  // enter the real-money finance ledger, and are displayed only while enabled.
  try {
    const { data: statusData, error: statusError } = await supabase.rpc('get_demo_mode_status');
    const status = (Array.isArray(statusData) ? statusData[0] : statusData) as { user_enabled?: boolean } | null;
    if (!statusError && status?.user_enabled === true) {
      const { data: demoData, error: demoError } = await supabase.rpc('my_tngn_market_orders');
      if (!demoError) {
        const demoHistory = ((demoData ?? []) as Array<{
          orderId: string; marketId: string | null; marketTitle: string; outcomeCode: string;
          stake: number | string; status: string; finalOutcome?: string | null; payout?: number | string | null;
          settledAt?: string | null; createdAt: string;
        }>).map((row): MarketHistoryRow => {
          const stake = Number(row.stake ?? 0);
          const payout = Number(row.payout ?? 0);
          const settled = ['SETTLED', 'VOIDED', 'CANCELLED'].includes(String(row.status).toUpperCase());
          const result: MarketHistoryRow['result'] = !settled
            ? 'PENDING'
            : String(row.status).toUpperCase() === 'VOIDED'
              ? 'VOID'
              : String(row.status).toUpperCase() === 'CANCELLED'
                ? 'REFUNDED'
                : payout > 0
                  ? 'WON'
                  : 'LOST';
          return {
            market_id: row.marketId ?? row.orderId,
            market_title: row.marketTitle,
            selected_outcome: row.outcomeCode,
            final_outcome: row.finalOutcome ?? null,
            asset_code: 'TNGN',
            matched_quantity: 0,
            stake_amount: stake,
            trading_fee: 0,
            gross_payout: payout,
            settlement_fee: 0,
            net_payout: payout,
            realized_pnl: settled ? payout - stake : 0,
            result,
            settled_at: row.settledAt ?? null,
          };
        });
        return [...demoHistory, ...realHistory].sort((a, b) =>
          (Date.parse(b.settled_at ?? '') || 0) - (Date.parse(a.settled_at ?? '') || 0),
        );
      }
    }
  } catch {
    // The real market history must remain usable if the optional demo read fails.
  }
  return realHistory;
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

export async function quotePoolStake(input: { instrumentPublicId: string; outcomeCode: 'YES' | 'NO'; amount: number }) {
  const assetCode = await getMarketAssetCode(input.instrumentPublicId);
  const { data, error } = await supabase.rpc(assetCode === 'TNGN' ? 'tngn_pool_quote' : 'pool_quote', {
    p_instrument_public_id: input.instrumentPublicId,
    p_outcome_code: input.outcomeCode,
    p_amount: input.amount,
  });
  assertNoError(error, 'trading', 'We could not prepare this prediction right now. Please try again.');
  return data as PoolQuote;
}

export async function placePoolStake(quote: PoolQuote) {
  const assetCode = await getMarketAssetCode(quote.instrumentPublicId);
  if (assetCode === 'TNGN') {
    const idempotencyKey = `tngn:${quote.instrumentPublicId}:${quote.outcomeCode}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const { data, error } = await supabase.rpc('place_tngn_market_stake', {
      p_instrument_public_id: quote.instrumentPublicId,
      p_outcome_code: quote.outcomeCode,
      p_amount: Number(quote.amount),
      p_idempotency_key: idempotencyKey,
    });
    assertNoError(error, 'trading', 'We could not commit this TNGN prediction. Please try again.');
    return data as PoolStakeStatus;
  }
  await ensureNgnLocationForInstrument(quote.instrumentPublicId);
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
