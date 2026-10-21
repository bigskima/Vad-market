import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
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
  getMarketHistory,
  getMyProposals,
  getOpenOrders,
  getPoolStakes,
  getPositions,
  getSettlementReceipts,
  getWalletActivity,
  getWalletSummary,
  listMarkets,
  type MarketCatalogItem,
  type MarketHistoryRow,
  type OrderRow,
  type PoolStakeRow,
  type PositionRow,
  type ProposalRow,
  type SettlementReceiptRow,
  type WalletActivityRow,
  type WalletRow,
} from '@/services/market-api';
import {
  getNotifications,
  markAllNotificationsRead as markAllNotificationsReadApi,
  markNotificationRead as markNotificationReadApi,
  type UserNotificationRow,
} from '@/services/notification-api';

type ProductSectionErrors = {
  markets: string | null;
  wallet: string | null;
  walletActivity: string | null;
  positions: string | null;
  orders: string | null;
  poolStakes: string | null;
  marketHistory: string | null;
  settlements: string | null;
  proposals: string | null;
  notifications: string | null;
};

const emptySectionErrors: ProductSectionErrors = {
  markets: null,
  wallet: null,
  walletActivity: null,
  positions: null,
  orders: null,
  poolStakes: null,
  marketHistory: null,
  settlements: null,
  proposals: null,
  notifications: null,
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

function settledError(result: PromiseSettledResult<unknown>, context: UserErrorContext, fallback: string) {
  if (result.status === 'fulfilled') return null;
  return userFacingErrorMessage(result.reason, context, fallback);
}

function upsertMarket(previous: MarketCatalogItem[], next: MarketCatalogItem) {
  const found = previous.some((item) => item.instrument_public_id === next.instrument_public_id);
  const merged = found
    ? previous.map((item) => item.instrument_public_id === next.instrument_public_id ? next : item)
    : [next, ...previous];
  return [...merged].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

function prependNotification(previous: UserNotificationRow[], next: UserNotificationRow) {
  return [next, ...previous.filter((item) => item.public_id !== next.public_id)].slice(0, 100);
}

export function useProductData(enabled = true, userId: string | null = null) {
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<ProductSectionErrors>(emptySectionErrors);
  const [markets, setMarkets] = useState<MarketCatalogItem[]>([]);
  const [wallet, setWallet] = useState<WalletRow[]>([]);
  const [walletActivity, setWalletActivity] = useState<WalletActivityRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [poolStakes, setPoolStakes] = useState<PoolStakeRow[]>([]);
  const [marketHistory, setMarketHistory] = useState<MarketHistoryRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementReceiptRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [notifications, setNotifications] = useState<UserNotificationRow[]>([]);
  const [liveNotification, setLiveNotification] = useState<UserNotificationRow | null>(null);
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
    setWalletActivity([]);
    setPositions([]);
    setOrders([]);
    setPoolStakes([]);
    setMarketHistory([]);
    setSettlements([]);
    setProposals([]);
    setNotifications([]);
    setLiveNotification(null);
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
    try { setAdminSummary(await getAdminRuntimeSummary()); } catch { setAdminSummary(null); }
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
      setHomeExperienceError(userFacingErrorMessage(reason, 'general', 'We could not refresh the latest highlights right now. Please try again.'));
    }
  }, [enabled]);

  const refreshMarkets = useCallback(async () => {
    if (!enabled) return;
    try {
      setMarkets(await listMarkets());
      setSectionErrors((current) => ({ ...current, markets: null }));
    } catch (reason) {
      setSectionErrors((current) => ({ ...current, markets: userFacingErrorMessage(reason, 'markets', 'We could not refresh markets right now.') }));
    }
  }, [enabled]);

  const refreshPortfolio = useCallback(async () => {
    if (!enabled) return;
    const results = await Promise.allSettled([
      getWalletSummary(),
      getWalletActivity(),
      getPositions(),
      getOpenOrders(),
      getPoolStakes(),
      getMarketHistory(),
      getSettlementReceipts(),
    ]);
    setSectionErrors((current) => ({
      ...current,
      wallet: settledError(results[0], 'payments', 'We could not refresh wallet balances right now.'),
      walletActivity: settledError(results[1], 'payments', 'We could not refresh wallet activity right now.'),
      positions: settledError(results[2], 'portfolio', 'We could not refresh your positions right now.'),
      orders: settledError(results[3], 'portfolio', 'We could not refresh your orders right now.'),
      poolStakes: settledError(results[4], 'portfolio', 'We could not refresh your committed predictions right now.'),
      marketHistory: settledError(results[5], 'portfolio', 'We could not refresh your market results right now.'),
      settlements: settledError(results[6], 'portfolio', 'We could not refresh your payout history right now.'),
    }));
    if (results[0].status === 'fulfilled') setWallet(results[0].value);
    if (results[1].status === 'fulfilled') setWalletActivity(results[1].value);
    if (results[2].status === 'fulfilled') setPositions(results[2].value);
    if (results[3].status === 'fulfilled') setOrders(results[3].value);
    if (results[4].status === 'fulfilled') setPoolStakes(results[4].value);
    if (results[5].status === 'fulfilled') setMarketHistory(results[5].value);
    if (results[6].status === 'fulfilled') setSettlements(results[6].value);
  }, [enabled]);

  const refreshNotifications = useCallback(async () => {
    if (!enabled) return;
    try {
      setNotifications(await getNotifications());
      setSectionErrors((current) => ({ ...current, notifications: null }));
    } catch (reason) {
      setSectionErrors((current) => ({ ...current, notifications: userFacingErrorMessage(reason, 'general', 'We could not refresh notifications right now.') }));
    }
  }, [enabled]);

  const load = useCallback(async () => {
    if (!enabled) return;
    const results = await Promise.allSettled([
      listMarkets(),
      getWalletSummary(),
      getWalletActivity(),
      getPositions(),
      getOpenOrders(),
      getPoolStakes(),
      getMarketHistory(),
      getSettlementReceipts(),
      getMyProposals(),
      getNotifications(),
    ]);

    const nextSectionErrors: ProductSectionErrors = {
      markets: settledError(results[0], 'markets', 'We could not refresh markets right now.'),
      wallet: settledError(results[1], 'payments', 'We could not refresh wallet balances right now.'),
      walletActivity: settledError(results[2], 'payments', 'We could not refresh wallet activity right now.'),
      positions: settledError(results[3], 'portfolio', 'We could not refresh your positions right now.'),
      orders: settledError(results[4], 'portfolio', 'We could not refresh your orders right now.'),
      poolStakes: settledError(results[5], 'portfolio', 'We could not refresh your committed predictions right now.'),
      marketHistory: settledError(results[6], 'portfolio', 'We could not refresh your market results right now.'),
      settlements: settledError(results[7], 'portfolio', 'We could not refresh your payout history right now.'),
      proposals: settledError(results[8], 'proposal', 'We could not refresh your market proposals right now.'),
      notifications: settledError(results[9], 'general', 'We could not refresh notifications right now.'),
    };
    setSectionErrors(nextSectionErrors);

    const failures = Object.values(nextSectionErrors).filter(Boolean).length;
    if (failures === results.length) setError('We could not refresh your VAD information right now. Your last available information is still shown where possible.');
    else if (failures > 0) setError('Some information could not refresh right now. Everything that updated successfully is still available.');
    else setError(null);

    if (results[0].status === 'fulfilled') setMarkets(results[0].value);
    if (results[1].status === 'fulfilled') setWallet(results[1].value);
    if (results[2].status === 'fulfilled') setWalletActivity(results[2].value);
    if (results[3].status === 'fulfilled') setPositions(results[3].value);
    if (results[4].status === 'fulfilled') setOrders(results[4].value);
    if (results[5].status === 'fulfilled') setPoolStakes(results[5].value);
    if (results[6].status === 'fulfilled') setMarketHistory(results[6].value);
    if (results[7].status === 'fulfilled') setSettlements(results[7].value);
    if (results[8].status === 'fulfilled') setProposals(results[8].value);
    if (results[9].status === 'fulfilled') setNotifications(results[9].value);
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
      void load().finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, load, probeAdmin, probeHomeExperience, reset]);

  useEffect(() => {
    if (!enabled || !userId) return;
    let marketRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    let portfolioRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const queueMarketRefresh = () => {
      if (marketRefreshTimer) clearTimeout(marketRefreshTimer);
      marketRefreshTimer = setTimeout(() => void refreshMarkets(), 250);
    };
    const queuePortfolioRefresh = () => {
      if (portfolioRefreshTimer) clearTimeout(portfolioRefreshTimer);
      portfolioRefreshTimer = setTimeout(() => void refreshPortfolio(), 250);
    };

    const channel = supabase
      .channel(`vad-product-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_catalog' }, (payload) => {
        if (payload.eventType === 'DELETE') { queueMarketRefresh(); return; }
        const next = payload.new as MarketCatalogItem;
        if (next?.instrument_public_id) setMarkets((current) => upsertMarket(current, next));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        const next = payload.new as UserNotificationRow;
        if (!next?.public_id) return;
        setNotifications((current) => prependNotification(current, next));
        setLiveNotification(next);
        queueMarketRefresh();
        queuePortfolioRefresh();
      })
      .subscribe();

    return () => {
      if (marketRefreshTimer) clearTimeout(marketRefreshTimer);
      if (portfolioRefreshTimer) clearTimeout(portfolioRefreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, refreshMarkets, refreshPortfolio, userId]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setRefreshing(true);
    try {
      await Promise.all([load(), probeHomeExperience()]);
      void probeAdmin();
    } finally { setRefreshing(false); }
  }, [enabled, load, probeAdmin, probeHomeExperience]);

  const markNotificationRead = useCallback(async (notificationPublicId: string) => {
    await markNotificationReadApi(notificationPublicId);
    setNotifications((current) => current.map((item) => item.public_id === notificationPublicId ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item));
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    await markAllNotificationsReadApi();
    const now = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
  }, []);

  const dismissLiveNotification = useCallback(() => setLiveNotification(null), []);
  const unreadNotificationCount = useMemo(() => notifications.filter((item) => !item.read_at).length, [notifications]);
  const ngn = useMemo(() => wallet.find((row) => row.asset_code === 'NGN') ?? wallet[0], [wallet]);

  return {
    loading,
    refreshing,
    error,
    sectionErrors,
    markets,
    wallet,
    walletActivity,
    positions,
    orders,
    poolStakes,
    marketHistory,
    settlements,
    proposals,
    notifications,
    liveNotification,
    unreadNotificationCount,
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
    refreshMarkets,
    refreshPortfolio,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    dismissLiveNotification,
  };
}
