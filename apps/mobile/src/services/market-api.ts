import { supabase } from '@/lib/supabase';

export type MarketCatalogItem = {
  instrument_public_id: string;
  event_public_id: string;
  title: string;
  category: string | null;
  asset_code: string;
  market_type: string;
  status: string;
  closes_at: string | null;
  yes_price: number | string | null;
  no_price: number | string | null;
  last_trade_at: string | null;
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
  quantity: number | string;
  total_cost_basis: number | string;
  average_price: number | string;
  status: string;
};

export type OrderRow = {
  order_id: string;
  market_id: number;
  outcome_id: number;
  side: string;
  limit_price: number | string;
  quantity: number | string;
  filled_quantity: number | string;
  remaining_quantity: number | string;
  status: string;
  created_at: string;
};

export type ProposalRow = {
  public_id: string;
  question: string;
  context: string | null;
  category: string | null;
  status: string;
  confidence: number | null;
  created_at: string;
};

function assertNoError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function listMarkets() {
  const { data, error } = await supabase.from('market_catalog').select('*').order('updated_at', { ascending: false });
  assertNoError(error);
  return (data ?? []) as MarketCatalogItem[];
}

export async function getWalletSummary() {
  const { data, error } = await supabase.rpc('my_wallet_summary');
  assertNoError(error);
  return (data ?? []) as WalletRow[];
}

export async function getPositions() {
  const { data, error } = await supabase.rpc('my_positions');
  assertNoError(error);
  return (data ?? []) as PositionRow[];
}

export async function getOpenOrders() {
  const { data, error } = await supabase.rpc('my_open_orders');
  assertNoError(error);
  return (data ?? []) as OrderRow[];
}

export async function getMyProposals() {
  const { data, error } = await supabase.rpc('my_market_proposals');
  assertNoError(error);
  return (data ?? []) as ProposalRow[];
}

export async function quoteTrade(input: { instrumentPublicId: string; outcomeCode: 'YES' | 'NO'; side: 'BUY' | 'SELL'; price: number; quantity: number }) {
  const { data, error } = await supabase.rpc('trade_quote', {
    p_instrument_public_id: input.instrumentPublicId,
    p_outcome_code: input.outcomeCode,
    p_side: input.side,
    p_price: input.price,
    p_quantity: input.quantity,
  });
  assertNoError(error);
  return data as TradeQuote;
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
  assertNoError(error);
  return data as string;
}

export async function cancelOrder(orderPublicId: string) {
  const { data, error } = await supabase.rpc('cancel_order', { p_order_public_id: orderPublicId });
  assertNoError(error);
  return Boolean(data);
}

export async function submitMarketProposal(input: { question: string; context?: string; category?: string; confidence?: number }) {
  const { data, error } = await supabase.rpc('submit_market_proposal', {
    p_question: input.question,
    p_context: input.context ?? null,
    p_category: input.category ?? null,
    p_confidence: input.confidence ?? null,
  });
  assertNoError(error);
  return data as string;
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
