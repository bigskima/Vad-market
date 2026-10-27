import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type TradingMethod = 'POOL' | 'ORDER_BOOK';
export type TradeLimitDefaults = {
  assetCode: 'NGN' | 'USDC';
  liquidityModel: TradingMethod;
  minTradeAmount: number;
  maxTradeAmount: number;
  updatedAt?: string;
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback: string): void {
  if (error) throw userFacingError(error, 'admin', fallback);
}

export async function getAdminMarketTradeLimitDefaults(
  assetCode: 'NGN' | 'USDC',
  liquidityModel: TradingMethod,
): Promise<TradeLimitDefaults> {
  const { data, error } = await supabase.rpc('admin_get_market_trade_limit_defaults', {
    p_asset_code: assetCode,
    p_liquidity_model: liquidityModel,
  });
  fail(error, 'Market trade-limit defaults could not be loaded.');
  const raw = data as Partial<TradeLimitDefaults> | null;
  const minimum = Number(raw?.minTradeAmount);
  const maximum = Number(raw?.maxTradeAmount);
  if (!raw || !Number.isFinite(minimum) || minimum <= 0 || !Number.isFinite(maximum) || maximum <= minimum) {
    throw new Error('The configured trade-limit defaults are invalid. Open Admin → Market limits and correct them.');
  }
  return {
    assetCode,
    liquidityModel,
    minTradeAmount: minimum,
    maxTradeAmount: maximum,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
  };
}

export async function saveAdminMarketTradeLimitDefaults(input: {
  assetCode: 'NGN' | 'USDC';
  liquidityModel: TradingMethod;
  minTradeAmount: number;
  maxTradeAmount: number;
}): Promise<void> {
  const { data, error } = await supabase.rpc('admin_save_market_trade_limit_defaults', {
    p_asset_code: input.assetCode,
    p_liquidity_model: input.liquidityModel,
    p_min_trade_amount: input.minTradeAmount,
    p_max_trade_amount: input.maxTradeAmount,
  });
  fail(error, 'Market trade-limit defaults could not be saved.');
  if (data !== true) throw new Error('VAD did not confirm the new market trade limits.');
}
