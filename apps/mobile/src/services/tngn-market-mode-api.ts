import { supabase } from '@/lib/supabase';

export type TngnMarketModeStatus = {
  assetCode: 'TNGN';
  globallyEnabled: boolean;
  userEnabled: boolean;
  eligible: boolean;
  availableBalance: number;
  nonWithdrawable: true;
  depositsEnabled: false;
  withdrawalsEnabled: false;
  transfersEnabled: false;
  standardMarketSettlement: true;
  message?: string;
};

function parseStatus(value: unknown): TngnMarketModeStatus {
  if (!value || typeof value !== 'object') {
    throw new Error('The server did not return TNGN market-testing status.');
  }
  const row = value as Record<string, unknown>;
  if (row.assetCode !== 'TNGN' || typeof row.eligible !== 'boolean' || typeof row.userEnabled !== 'boolean') {
    throw new Error('The server returned an invalid TNGN market-testing status.');
  }
  return {
    assetCode: 'TNGN',
    globallyEnabled: Boolean(row.globallyEnabled),
    userEnabled: Boolean(row.userEnabled),
    eligible: row.eligible,
    availableBalance: Number.isFinite(Number(row.availableBalance)) ? Number(row.availableBalance) : 0,
    nonWithdrawable: true,
    depositsEnabled: false,
    withdrawalsEnabled: false,
    transfersEnabled: false,
    standardMarketSettlement: true,
    message: typeof row.message === 'string' ? row.message : undefined,
  };
}

export async function getTngnMarketMode(): Promise<TngnMarketModeStatus> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Sign in to view TNGN market-testing settings.');
  const { data, error } = await supabase.rpc('get_my_tngn_market_mode');
  if (error) throw error;
  return parseStatus(data);
}

export async function setTngnMarketMode(enabled: boolean): Promise<TngnMarketModeStatus> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Sign in to change TNGN market-testing settings.');
  const { data, error } = await supabase.rpc('set_my_tngn_market_mode', { p_enabled: enabled });
  if (error) throw error;
  const status = parseStatus(data);
  if (status.userEnabled !== enabled) {
    throw new Error('The server did not confirm the TNGN market-testing preference.');
  }
  return status;
}
