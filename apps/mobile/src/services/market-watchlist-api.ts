import { supabase } from '@/lib/supabase';
import { userFacingError } from '@/lib/user-facing-error';

export type UserMarketWatchlistRow = {
  instrument_public_id: string;
  created_at: string;
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null) {
  if (error) throw userFacingError(error, 'markets', 'Your watchlist could not be updated. Please try again.');
}

export async function listUserMarketWatchlist(): Promise<UserMarketWatchlistRow[]> {
  const { data, error } = await supabase
    .from('user_market_watchlist')
    .select('instrument_public_id, created_at')
    .order('created_at', { ascending: false });
  fail(error);
  return (data ?? []) as UserMarketWatchlistRow[];
}

export async function saveMarketToWatchlist(userId: string, instrumentPublicId: string) {
  const { error } = await supabase
    .from('user_market_watchlist')
    .insert({ user_id: userId, instrument_public_id: instrumentPublicId });
  fail(error);
}

export async function removeMarketFromWatchlist(userId: string, instrumentPublicId: string) {
  const { error } = await supabase
    .from('user_market_watchlist')
    .delete()
    .eq('user_id', userId)
    .eq('instrument_public_id', instrumentPublicId);
  fail(error);
}
