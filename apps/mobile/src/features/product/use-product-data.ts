import { useCallback, useEffect, useMemo, useState } from 'react';

import { userFacingErrorMessage, type UserErrorContext } from '@/lib/user-facing-error';
import {
  getHomeExperience,
  type FeaturedMarketRow,
  type FeaturedMarketSettings,
  type HomePromotion,
  type PublicNotice,
  type TrendingMarketRow,
  type TrendingMarketSettings,
  type VadMarketRow,
} from '@/services/home-content-api';
import {
  getAdminRuntimeSummary,
  getMyProposals,
  getOpenOrders,
  getPositions,
  getWalletSummary,
  listMarkets,
  type MarketCatalogItem,
  type OrderRow,
  type PositionRow,
  type ProposalRow,
  type WalletRow,
} from '@/services/market-api';

type ProductSectionErrors = {
  markets: string | null;
  wallet: string | null;
  positions: string | null;
  orders: string | null;
  proposals: string | null;
};

const emptySectionErrors: ProductSectionErrors = {
  markets: null,
  wallet: null,
  positions: null,
  orders: null,
  proposals: null,
};

const defaultFeaturedSettings: FeaturedMarketSettings = {
  enabled: true,
  minimumVolumeNgn: 1_000_000,
  windowHours: 24,
  maxMarkets: 20,
  lastRefreshedAt: null,
};

const defaultTrendingSettings: TrendingMarketSettings = {
  enabled: true,
  windowMinutes: 60,
  baselineHours: 6,
  minimumVolumeNgn: 100_000,
  minimumTrades: 5,
  minimumUniqueTraders: 3,
  minimumAcceleration: 1.5,
  maxMarkets: 12,
  lastRefreshedAt: null,
};

function settledError(
  result: PromiseSettledResult<unknown>,
  context: UserErrorContext,
  fallback: string,
) {
  if (result.status === 'fulfilled') return null;
  return userFacingErrorMessage(result.reason, context, fallback);
}

export function useProductData(enabled = true) {
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<ProductSectionErrors>(emptySectionErrors);
  const [markets, setMarkets] = useState<MarketCatalogItem[]>([]);
  const [wallet, setWallet] = useState<WalletRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [homePromotions, setHomePromotions] = useState<HomePromotion[]>([]);
  const [publicNotices, setPublicNotices] = useState<PublicNotice[]>([]);
  const [vadMarkets, setVadMarkets] = useState<VadMarketRow[]>([]);
  const [featuredMarkets, setFeaturedMarkets] = useState<FeaturedMarketRow[]>([]);
  const [trendingMarkets, setTrendingMarkets] = useState<TrendingMarketRow[]>([]);
  const [featuredMarketSettings, setFeaturedMarketSettings] = useState<FeaturedMarketSettings>(defaultFeaturedSettings);
  const [trendingMarketSettings, setTrendingMarketSettings] = useState<TrendingMarketSettings>(defaultTrendingSettings);
  const [homeExperienceError, setHomeExperienceError] = useState<string | null>(null);
  const [adminSummary, setAdminSummary] = useState<Record<string, number | string> | null>(null);

  const reset = useCallback(() => {
    setMarkets([]);
    setWallet([]);
    setPositions([]);
    setOrders([]);
    setProposals([]);
    setHomePromotions([]);
    setPublicNotices([]);
    setVadMarkets([]);
    setFeaturedMarkets([]);
    setTrendingMarkets([]);
    setFeaturedMarketSettings(defaultFeaturedSettings);
    setTrendingMarketSettings(defaultTrendingSettings);
    setHomeExperienceError(null);
    setAdminSummary(null);
    setSectionErrors(emptySectionErrors);
    setError(null);
  }, []);

  const probeAdmin = useCallback(async () => {
    if (!enabled) return;
    try {
      setAdminSummary(await getAdminRuntimeSummary());
    } catch {
      setAdminSummary(null);
    }
  }, [enabled]);

  const probeHomeExperience = useCallback(async () => {
    if (!enabled) return;
    try {
      const next = await getHomeExperience();
      setHomePromotions(next.promotions);
      setPublicNotices(next.notices);
      setVadMarkets(next.vadMarkets);
      setFeaturedMarkets(next.featuredMarkets);
      setTrendingMarkets(next.trendingMarkets);
      setFeaturedMarketSettings(next.featuredSettings);
      setTrendingMarketSettings(next.trendingSettings);
      setHomeExperienceError(null);
    } catch (reason) {
      setHomeExperienceError(
        userFacingErrorMessage(
          reason,
          'general',
          'We could not refresh the latest highlights right now. Please try again.',
        ),
      );
    }
  }, [enabled]);

  const load = useCallback(async () => {
    if (!enabled) return;
    const results = await Promise.allSettled([
      listMarkets(),
      getWalletSummary(),
      getPositions(),
      getOpenOrders(),
      getMyProposals(),
    ]);

    const nextSectionErrors: ProductSectionErrors = {
      markets: settledError(results[0], 'markets', 'We could not refresh markets right now.'),
      wallet: settledError(results[1], 'payments', 'We could not refresh wallet balances right now.'),
      positions: settledError(results[2], 'portfolio', 'We could not refresh your positions right now.'),
      orders: settledError(results[3], 'portfolio', 'We could not refresh your orders right now.'),
      proposals: settledError(results[4], 'proposal', 'We could not refresh your market proposals right now.'),
    };
    setSectionErrors(nextSectionErrors);

    const failures = Object.values(nextSectionErrors).filter(Boolean).length;
    if (failures === results.length) {
      setError('We could not refresh your VAD information right now. Your last available information is still shown where possible.');
    } else if (failures > 0) {
      setError('Some information could not refresh right now. Everything that updated successfully is still available.');
    } else {
      setError(null);
    }

    if (results[0].status === 'fulfilled') setMarkets(results[0].value);
    if (results[1].status === 'fulfilled') setWallet(results[1].value);
    if (results[2].status === 'fulfilled') setPositions(results[2].value);
    if (results[3].status === 'fulfilled') setOrders(results[3].value);
    if (results[4].status === 'fulfilled') setProposals(results[4].value);
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!enabled) {
        reset();
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setLoading(true);
      void probeAdmin();
      void probeHomeExperience();
      void load().finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, load, probeAdmin, probeHomeExperience, reset]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setRefreshing(true);
    try {
      await Promise.all([load(), probeHomeExperience()]);
      void probeAdmin();
    } finally {
      setRefreshing(false);
    }
  }, [enabled, load, probeAdmin, probeHomeExperience]);

  const ngn = useMemo(() => wallet.find((row) => row.asset_code === 'NGN') ?? wallet[0], [wallet]);

  return {
    loading,
    refreshing,
    error,
    sectionErrors,
    markets,
    wallet,
    positions,
    orders,
    proposals,
    homePromotions,
    publicNotices,
    vadMarkets,
    featuredMarkets,
    trendingMarkets,
    featuredMarketSettings,
    trendingMarketSettings,
    homeExperienceError,
    adminSummary,
    ngn,
    load,
    refresh,
  };
}
