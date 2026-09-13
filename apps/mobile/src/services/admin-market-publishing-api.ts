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

export type AdminTrendingMarketSettings = {
  enabled: boolean;
  windowMinutes: number;
  baselineHours: number;
  minimumVolumeNgn: number;
  minimumTrades: number;
  minimumUniqueTraders: number;
  minimumAcceleration: number;
  maxMarkets: number;
  lastRefreshedAt: string | null;
};

export type AdminTrendingRanking = {
  instrumentPublicId: string;
  rank: number;
  volumeNgn: number;
  tradeCount: number;
  uniqueTraders: number;
  momentumScore: number;
  volumeAcceleration: number;
  tradeAcceleration: number;
  priceMovement: number;
  lastTradeAt: string | null;
  calculatedAt: string;
};

export type AdminMarketSuppression = {
  instrumentPublicId: string;
  featuredSuppressed: boolean;
  trendingSuppressed: boolean;
  reason: string | null;
  updatedAt: string;
};

export type AdminTrendingMarketSnapshot = {
  settings: AdminTrendingMarketSettings;
  rankings: AdminTrendingRanking[];
  suppressions: AdminMarketSuppression[];
};

type AdminRpcError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

function fail(error: AdminRpcError | null, fallback: string) {
  if (error) throw userFacingError(error, 'admin', fallback);
}

function canRetryPublish(error: AdminRpcError | null) {
  if (!error) return false;
  const code = (error.code ?? '').toUpperCase();
  return !['42501', '22023', 'P0001', 'P0002'].includes(code);
}

async function publishOnce(input: {
  instrumentPublicId: string;
  vadPriority: number;
  reason: string;
}) {
  return supabase.rpc('admin_publish_market', {
    p_instrument_public_id: input.instrumentPublicId,
    p_feature_rank: input.vadPriority,
    p_reason: input.reason.trim(),
  });
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

export async function getAdminTrendingMarketSnapshot() {
  const { data, error } = await supabase.rpc('admin_trending_market_snapshot');
  fail(error, 'We could not load Trending Markets controls right now. Refresh and try again.');
  const raw = (data ?? {}) as Partial<AdminTrendingMarketSnapshot>;
  const settings = (raw.settings ?? {}) as Partial<AdminTrendingMarketSettings>;
  return {
    settings: {
      enabled: settings.enabled !== false,
      windowMinutes: Number(settings.windowMinutes ?? 60),
      baselineHours: Number(settings.baselineHours ?? 6),
      minimumVolumeNgn: Number(settings.minimumVolumeNgn ?? 100_000),
      minimumTrades: Number(settings.minimumTrades ?? 5),
      minimumUniqueTraders: Number(settings.minimumUniqueTraders ?? 3),
      minimumAcceleration: Number(settings.minimumAcceleration ?? 1.5),
      maxMarkets: Number(settings.maxMarkets ?? 12),
      lastRefreshedAt: settings.lastRefreshedAt ?? null,
    },
    rankings: Array.isArray(raw.rankings) ? raw.rankings : [],
    suppressions: Array.isArray(raw.suppressions) ? raw.suppressions : [],
  } satisfies AdminTrendingMarketSnapshot;
}

export async function publishAdminMarket(input: {
  instrumentPublicId: string;
  vadPriority: number;
  reason: string;
}) {
  const first = await publishOnce(input);
  if (!first.error) return Boolean(first.data);

  if (!canRetryPublish(first.error)) {
    fail(first.error, 'We could not publish this market right now. Please review the market details and try again.');
    return false;
  }

  await new Promise((resolve) => setTimeout(resolve, 350));
  const second = await publishOnce(input);
  fail(second.error ?? first.error, 'We could not confirm publication right now. Refresh Market Publishing before trying again.');
  return Boolean(second.data);
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

export async function updateAdminTrendingMarketSettings(input: {
  enabled: boolean;
  windowMinutes: number;
  baselineHours: number;
  minimumVolumeNgn: number;
  minimumTrades: number;
  minimumUniqueTraders: number;
  minimumAcceleration: number;
  maxMarkets: number;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_update_trending_market_settings', {
    p_enabled: input.enabled,
    p_window_minutes: input.windowMinutes,
    p_baseline_hours: input.baselineHours,
    p_minimum_volume_ngn: input.minimumVolumeNgn,
    p_minimum_trades: input.minimumTrades,
    p_minimum_unique_traders: input.minimumUniqueTraders,
    p_minimum_acceleration: input.minimumAcceleration,
    p_max_markets: input.maxMarkets,
    p_reason: input.reason.trim(),
  });
  fail(error, 'We could not save Trending Markets settings right now. Please try again.');
  return data as AdminTrendingMarketSnapshot;
}

export async function setAdminMarketHomeSuppression(input: {
  instrumentPublicId: string;
  surface: 'FEATURED' | 'TRENDING';
  suppressed: boolean;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_set_market_home_suppression', {
    p_instrument_public_id: input.instrumentPublicId,
    p_surface: input.surface,
    p_suppressed: input.suppressed,
    p_reason: input.reason.trim(),
  });
  fail(error, `We could not ${input.suppressed ? 'hide' : 'restore'} this market right now. Please try again.`);
  return Boolean(data);
}

export async function refreshAdminFeaturedMarketRankings() {
  const { data, error } = await supabase.rpc('admin_refresh_featured_market_rankings');
  fail(error, 'We could not refresh Featured Markets right now. Please try again.');
  return Number(data ?? 0);
}

export async function refreshAdminTrendingMarketRankings() {
  const { data, error } = await supabase.rpc('admin_refresh_trending_market_rankings');
  fail(error, 'We could not refresh Trending Markets right now. Please try again.');
  return Number(data ?? 0);
}
