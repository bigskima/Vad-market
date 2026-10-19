import { supabase } from '@/lib/supabase';
import { userFacingError } from '@/lib/user-facing-error';

export type WalletBalanceHistoryPoint = {
  observed_on: string;
  asset_code: string;
  balance: number | string;
};

export async function getWalletBalanceHistory(days = 30): Promise<WalletBalanceHistoryPoint[]> {
  const { data, error } = await supabase.rpc('my_wallet_balance_history', { p_days: days });
  if (error) throw userFacingError(error, 'payments', 'Wallet history is temporarily unavailable.');
  return (data ?? []) as WalletBalanceHistoryPoint[];
}
