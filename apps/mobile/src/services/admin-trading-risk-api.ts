import { supabase } from '@/lib/supabase';

export type AdminTradingRiskPolicy = {
  asset_code: string;
  policy_version: number;
  enabled: boolean;
  pool_max_entry_stake: number | string;
  pool_max_user_market_stake: number | string;
  pool_max_market_total: number | string;
  pool_max_payout_multiple: number | string;
  order_max_order_notional: number | string;
  order_max_user_market_exposure: number | string;
  updated_at: string;
};

export type AdminTradingRiskPolicyInput = {
  assetCode: string;
  enabled: boolean;
  poolMaxEntryStake: number;
  poolMaxUserMarketStake: number;
  poolMaxMarketTotal: number;
  poolMaxPayoutMultiple: number;
  orderMaxOrderNotional: number;
  orderMaxUserMarketExposure: number;
};

function ensureSuccess(error: { message?: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

export async function getAdminTradingRiskPolicies() {
  const { data, error } = await supabase.rpc('admin_get_trading_risk_policy_defaults');
  ensureSuccess(error, 'Could not load trading risk policies.');
  return (Array.isArray(data) ? data : []) as AdminTradingRiskPolicy[];
}

export async function updateAdminTradingRiskPolicy(input: AdminTradingRiskPolicyInput) {
  const { data, error } = await supabase.rpc('admin_update_trading_risk_policy_defaults', {
    p_asset_code: input.assetCode,
    p_enabled: input.enabled,
    p_pool_max_entry_stake: input.poolMaxEntryStake,
    p_pool_max_user_market_stake: input.poolMaxUserMarketStake,
    p_pool_max_market_total: input.poolMaxMarketTotal,
    p_pool_max_payout_multiple: input.poolMaxPayoutMultiple,
    p_order_max_order_notional: input.orderMaxOrderNotional,
    p_order_max_user_market_exposure: input.orderMaxUserMarketExposure,
  });
  ensureSuccess(error, 'Could not save trading risk policies.');
  return Number(data);
}
