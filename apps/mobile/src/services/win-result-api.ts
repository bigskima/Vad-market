import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type WinCelebrationRow = {
  market_id: string;
  market_title: string;
  category: string | null;
  selected_outcome: string;
  final_outcome: string | null;
  asset_code: string;
  stake_amount: number | string;
  trading_fee: number | string;
  gross_payout: number | string;
  settlement_fee: number | string;
  net_payout: number | string;
  realized_pnl: number | string;
  settled_at: string;
  display_name: string | null;
  handle: string | null;
  avatar_path: string | null;
};

export async function getPendingWinCelebrations(limit = 10) {
  const { data, error } = await supabase.rpc('my_pending_win_celebrations', {
    p_limit: Math.max(1, Math.min(Math.trunc(limit), 50)),
  });
  if (error) {
    throw userFacingError(
      error,
      'portfolio',
      'We could not check your latest settled wins right now.',
    );
  }
  return (data ?? []) as WinCelebrationRow[];
}

export async function acknowledgeWinCelebration(marketId: string, outcomeCode: string) {
  const { data, error } = await supabase.rpc('acknowledge_win_celebration', {
    p_instrument_public_id: marketId,
    p_outcome_code: outcomeCode,
  });
  if (error) {
    throw userFacingError(error, 'portfolio', 'We could not save this celebration yet.');
  }
  return data === true;
}
