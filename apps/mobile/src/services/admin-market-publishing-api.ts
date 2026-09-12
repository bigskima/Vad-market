import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type AdminMarketPublicationRow = {
  instrument_public_id: string;
  event_public_id: string;
  title: string;
  category: string;
  asset_code: string;
  instrument_status: string;
  event_status: string;
  opens_at: string | null;
  closes_at: string;
  is_vad_market: boolean;
  vad_priority: number | null;
  vad_published_at: string | null;
  automatic_feature_rank: number | null;
  automatic_volume_ngn: number | null;
  automatic_trade_count: number | null;
  automatic_featured: boolean | null;
};

export type AdminFeaturedMarketSettings = {
  enabled: boolean;
  minimumVolumeNgn: number;
  windowHours: number;
  maxMarkets: number;
  lastRefreshedAt: string | null;
};

function fail(
  error: { message: string; code?: string; details?: string; hint?: string } | null,
  fallback: string,
) {
  if (error) throw userFacingError(error, 'admin', fallback);
}

export async function getAdminMarketPublicationQueue() {
  const { data, error } = await supabase.rpc('admin_market_publication_queue_v2');
  fail(error, 'We could not load the market publishing workspace right now. Refresh and try again.');
  return (data ?? []) as AdminMarketPublicationRow[];
}

export async function getAdminFeaturedMarketSettings() {
  const { data, error } = await supabase.rpc('admin_featured_market_settings');
  fail(error, 'We could not load Featured Markets settings right now. Refresh and try again.');
  const raw = (data ?? {}) as Partial<AdminFeaturedMarketSettings>;
  return {
    enabled: raw.enabled !== false,
    minimumVolumeNgn: Number(raw.minimumVolumeNgn ?? 1_000_000),
    windowHours: Number(raw.windowHours ?? 24),
    maxMarkets: Number(raw.maxMarkets ?? 20),
    lastRefreshedAt: raw.lastRefreshedAt ?? null,
  } satisfies AdminFeaturedMarketSettings;
}

export async function publishAdminMarket(input: {
  instrumentPublicId: string;
  vadPriority: number;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_publish_market', {
    p_instrument_public_id: input.instrumentPublicId,
    p_feature_rank: input.vadPriority,
    p_reason: input.reason.trim(),
  });
  fail(error, 'We could not publish this market right now. Please try again.');
  return Boolean(data);
}

export async function setAdminVadMarket(input: {
  instrumentPublicId: string;
  active: boolean;
  priority: number;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_set_vad_market', {
    p_instrument_public_id: input.instrumentPublicId,
    p_active: input.active,
    p_priority: input.priority,
    p_reason: input.reason.trim(),
  });
  fail(error, 'We could not update this VAD Market right now. Please try again.');
  return Boolean(data);
}

export async function updateAdminFeaturedMarketSettings(input: {
  enabled: boolean;
  minimumVolumeNgn: number;
  windowHours: number;
  maxMarkets: number;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_update_featured_market_settings', {
    p_enabled: input.enabled,
    p_minimum_volume_ngn: input.minimumVolumeNgn,
    p_window_hours: input.windowHours,
    p_max_markets: input.maxMarkets,
    p_reason: input.reason.trim(),
  });
  fail(error, 'We could not save Featured Markets settings right now. Please try again.');
  return data as AdminFeaturedMarketSettings;
}

export async function refreshAdminFeaturedMarketRankings() {
  const { data, error } = await supabase.rpc('admin_refresh_featured_market_rankings');
  fail(error, 'We could not refresh Featured Markets right now. Please try again.');
  return Number(data ?? 0);
}
