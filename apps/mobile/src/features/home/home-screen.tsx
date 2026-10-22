import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { HomePromotionCarousel } from '@/features/home/components/home-promotion-carousel';
import { TourTarget } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useLiveNow } from '@/hooks/use-live-now';
import { getMarketTiming } from '@/lib/market-timing';
import { useVadTheme } from '@/providers/theme-provider';
import { useCurrencyPreference, type VADCurrency } from '@/providers/currency-preference-provider';
import type { HomePromotion, TrendingMarketRow, TrendingMarketSettings } from '@/services/home-content-api';
import { getMarketPriceHistory, type MarketCatalogItem, type WalletRow } from '@/services/market-api';
import { listUserMarketWatchlist, removeMarketFromWatchlist, saveMarketToWatchlist } from '@/services/market-watchlist-api';
import { supabase } from '@/lib/supabase';
import { getWalletBalanceHistory, type WalletBalanceHistoryPoint } from '@/services/wallet-history-api';
import { MarketThumbnail } from '@/features/markets/components/market-thumbnail';

type Category = string;

export function HomeScreen({
  markets, wallets, promotions, trendingMarkets, trendingSettings, marketError, onRetryMarkets,
  userName, userId, hasUnreadNotifications, onOpenMarket, onOpenPromotion, onExploreMarkets, onNotifications, onDeposit, onWithdraw, onSend, onOpenCryptoAssets,
}: {
  markets: MarketCatalogItem[];
  wallets: WalletRow[];
  promotions: HomePromotion[];
  trendingMarkets: TrendingMarketRow[];
  trendingSettings: TrendingMarketSettings;
  marketError?: string | null;
  onRetryMarkets: () => void;
  userName: string;
  userId: string;
  hasUnreadNotifications: boolean;
  onOpenMarket: (market: MarketCatalogItem) => void;
  onOpenPromotion: (targetPath: string) => void;
  onExploreMarkets: (category?: string) => void;
  onNotifications: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onSend: () => void;
  onOpenCryptoAssets: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const now = useLiveNow();
  const { enabledCurrencies, preferredCurrency, setPreferredCurrency } = useCurrencyPreference();
  const [category, setCategory] = useState<Category>('All');
  const [dismissedPromotionSignature, setDismissedPromotionSignature] = useState<string | null>(null);
  const [promotionPlaceholderDismissed, setPromotionPlaceholderDismissed] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [balanceHistory, setBalanceHistory] = useState<WalletBalanceHistoryPoint[]>([]);
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [watchlistBusyId, setWatchlistBusyId] = useState<string | null>(null);
  const [marketHistoryById, setMarketHistoryById] = useState<Record<string, number[]>>({});

  useEffect(() => {
    let active = true;
    const loadUserHomeData = async () => {
      if (!userId) {
        setProfileName(null);
        setProfileAvatarUrl(null);
        setWatchlistIds([]);
        setWatchlistError(null);
        setWatchlistLoading(false);
        setBalanceHistory([]);
        return;
      }
      setProfileName(null);
      setProfileAvatarUrl(null);
      setBalanceHistory([]);
      setWatchlistIds([]);
      setMarketHistoryById({});
      setWatchlistError(null);
      setWatchlistLoading(true);
      const [profileResult, balanceResult, watchlistResult] = await Promise.allSettled([
        supabase.from('profiles').select('display_name, avatar_path').eq('user_id', userId).maybeSingle(),
        getWalletBalanceHistory(30),
        listUserMarketWatchlist(),
      ]);
      if (!active) return;
      if (profileResult.status === 'fulfilled' && profileResult.value.data) {
        const profile = profileResult.value.data;
        setProfileName(profile.display_name ?? null);
        setProfileAvatarUrl(profile.avatar_path ? supabase.storage.from('profile-media').getPublicUrl(profile.avatar_path).data.publicUrl : null);
      } else {
        setProfileName(null);
        setProfileAvatarUrl(null);
      }
      setBalanceHistory(balanceResult.status === 'fulfilled' ? balanceResult.value : []);
      if (watchlistResult.status === 'fulfilled') {
        setWatchlistIds(watchlistResult.value.map((row) => row.instrument_public_id));
        setWatchlistError(null);
      } else {
        setWatchlistError('Your watchlist could not be loaded. Please try again.');
      }
      setWatchlistLoading(false);
    };
    void loadUserHomeData();
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    let active = true;
    if (!watchlistIds.length) return () => { active = false; };
    void Promise.all(watchlistIds.slice(0, 10).map(async (id) => {
      try {
        const rows = await getMarketPriceHistory(id, 30);
        const values = rows.filter((row) => row.outcome_code === 'YES').sort((a, b) => a.observed_at.localeCompare(b.observed_at)).map((row) => Number(row.price)).filter(Number.isFinite);
        return [id, values] as const;
      } catch { return [id, []] as const; }
    })).then((entries) => { if (active) setMarketHistoryById(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [watchlistIds]);

  const retryWatchlist = async () => {
    setWatchlistLoading(true);
    setWatchlistError(null);
    try {
      const rows = await listUserMarketWatchlist();
      setWatchlistIds(rows.map((row) => row.instrument_public_id));
    } catch {
      setWatchlistError('Your watchlist could not be loaded. Please try again.');
    } finally {
      setWatchlistLoading(false);
    }
  };

  const toggleWatchlist = async (instrumentPublicId: string) => {
    if (watchlistBusyId) return;
    const isSaved = watchlistIds.includes(instrumentPublicId);
    setWatchlistBusyId(instrumentPublicId);
    setWatchlistError(null);
    try {
      if (isSaved) await removeMarketFromWatchlist(userId, instrumentPublicId);
      else await saveMarketToWatchlist(userId, instrumentPublicId);
      setWatchlistIds((current) => isSaved
        ? current.filter((id) => id !== instrumentPublicId)
        : [instrumentPublicId, ...current]);
    } catch {
      setWatchlistError('We could not update your watchlist. Please try again.');
    } finally {
      setWatchlistBusyId(null);
    }
  };
  const visibleMarkets = markets.filter((market) => enabledCurrencies.includes(market.asset_code as VADCurrency));
  const activeMarkets = visibleMarkets.filter((market) => getMarketTiming(market, now).tradingOpen && market.resolution_status !== 'RESOLVED');
  // Categories come from the live market catalogue returned by the database-backed market service.
  // "All" is a UI-only filter, not a market category stored or invented in the database.
  const marketCategories = useMemo(
    () => Array.from(new Set(visibleMarkets
      .map((market) => market.category?.trim())
      .filter((value): value is string => Boolean(value))))
      .sort((a, b) => a.localeCompare(b)),
    [visibleMarkets],
  );
  const availableCategories = useMemo(() => ['All', ...marketCategories], [marketCategories]);
  const trendingRows = useMemo(() => trendingMarkets
    .map((entry) => ({ entry, market: activeMarkets.find((market) => market.instrument_public_id === entry.instrument_public_id) }))
    .filter((row): row is { entry: TrendingMarketRow; market: MarketCatalogItem } => Boolean(row.market))
    .filter(({ market }) => category === 'All' || categoryMatches(market.category, category))
    .slice(0, 5), [trendingMarkets, activeMarkets, category]);
  const watchlistMarkets = useMemo(() => watchlistIds
    .map((id) => visibleMarkets.find((market) => market.instrument_public_id === id))
    .filter((market): market is MarketCatalogItem => Boolean(market))
    .slice(0, 10), [watchlistIds, visibleMarkets]);
  const walletRows = wallets.filter((wallet) => enabledCurrencies.includes(wallet.asset_code as VADCurrency));
  const totalNgn = walletRows.filter((wallet) => wallet.asset_code === 'NGN').reduce((sum, wallet) => sum + Number(wallet.available || 0) + Number(wallet.reserved || 0) + Number(wallet.withdrawal_pending || 0), 0);
  const totalUsdc = walletRows.filter((wallet) => wallet.asset_code === 'USDC').reduce((sum, wallet) => sum + Number(wallet.available || 0) + Number(wallet.reserved || 0) + Number(wallet.withdrawal_pending || 0), 0);
  const totalTngn = walletRows.filter((wallet) => wallet.asset_code === 'TNGN').reduce((sum, wallet) => sum + Number(wallet.available || 0) + Number(wallet.reserved || 0) + Number(wallet.withdrawal_pending || 0), 0);
  const promotionSignature = promotions.map((promotion) => promotion.public_id).join('|');
  const promotionsToShow = dismissedPromotionSignature === promotionSignature ? [] : promotions;
  const displayCurrencies = enabledCurrencies.filter((code): code is VADCurrency => ['NGN', 'USDC', 'TNGN'].includes(code));
  const primaryAsset: VADCurrency | null = preferredCurrency && displayCurrencies.includes(preferredCurrency)
    ? preferredCurrency
    : displayCurrencies.includes('NGN') ? 'NGN' : displayCurrencies[0] ?? null;
  const primaryBalance = primaryAsset === 'NGN'
    ? formatMoney(totalNgn, 'NGN')
    : primaryAsset === 'USDC'
      ? formatMoney(totalUsdc, 'USDC')
      : primaryAsset === 'TNGN'
        ? formatMoney(totalTngn, 'TNGN')
        : '—';
  const primaryHistory = balanceHistory.filter((point) => point.asset_code === primaryAsset).sort((a, b) => a.observed_on.localeCompare(b.observed_on));
  const secondaryBalances = displayCurrencies
    .filter((code) => code !== primaryAsset)
    .map((code) => ({
      code,
      total: code === 'NGN' ? totalNgn : code === 'USDC' ? totalUsdc : totalTngn,
    }))
    .filter((item) => item.total > 0);
  const historyValues = primaryHistory.map((point) => Number(point.balance)).filter(Number.isFinite);
  const hasBalanceTrend = historyValues.length > 1 && historyValues.some((value) => value !== historyValues[0]);
  const balanceChange = hasBalanceTrend ? historyValues[historyValues.length - 1] - historyValues[0] : null;
  const balanceChangePercent = balanceChange !== null && historyValues[0] !== 0 ? (balanceChange / Math.abs(historyValues[0])) * 100 : null;

  return (
    <View style={{ width: '100%', gap: density.compact ? 10 : 13 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
          {profileAvatarUrl ? <Image source={{ uri: profileAvatarUrl }} accessibilityLabel="Profile photo" onError={() => setProfileAvatarUrl(null)} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : <VadIcon name="account" size={23} tone="secondary" />}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <VadText variant="caption" tone="secondary">Good {getGreeting()},</VadText>
          <VadText variant="bodyStrong" style={{ fontSize: 18, lineHeight: 22 }}>{(profileName || userName || 'VAD member').trim().split(/\s+/)[0]}</VadText>
        </View>
        <HomeHeaderAction label="Search markets" icon="search" onPress={() => onExploreMarkets()} />
        <HomeHeaderAction label="Live crypto prices" icon="activity" onPress={onOpenCryptoAssets} />
        <HomeHeaderAction label="Notifications" icon="bell" badge={hasUnreadNotifications} onPress={onNotifications} />
      </View>

      <TourTarget id="home-overview">
        <View style={{ padding: density.compact ? 12 : 14, minHeight: density.compact ? 104 : 114, overflow: 'hidden', borderRadius: 19, borderWidth: 1, borderColor: theme.mode === 'dark' ? '#123B3B' : theme.colors.border, backgroundColor: theme.mode === 'dark' ? '#071B1D' : theme.colors.surface, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable
              accessibilityRole={displayCurrencies.length > 1 ? 'button' : undefined}
              accessibilityLabel={displayCurrencies.length > 1 ? `Change home display currency, currently ${primaryAsset ?? 'none'}` : 'Total balance'}
              accessibilityHint={displayCurrencies.length > 1 ? 'Cycles through currencies enabled for your account.' : undefined}
              disabled={displayCurrencies.length < 2}
              onPress={() => {
                if (!primaryAsset || displayCurrencies.length < 2) return;
                const current = displayCurrencies.indexOf(primaryAsset);
                const next = displayCurrencies[(current + 1) % displayCurrencies.length];
                if (next) setPreferredCurrency(next);
              }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed ? 0.7 : 1 })}
            >
              <VadText variant="body" tone="secondary">{primaryAsset ? `Total balance · ${primaryAsset}` : 'Total balance'}</VadText>
              {displayCurrencies.length > 1 ? <VadIcon name="chevronRight" size={14} tone="secondary" /> : null}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={balanceVisible ? 'Hide balance' : 'Show balance'} onPress={() => setBalanceVisible((visible) => !visible)} hitSlop={10}>
              <VadIcon name={balanceVisible ? 'eye' : 'eyeOff'} size={19} tone="secondary" />
            </Pressable>
          </View>
          <VadText variant="title" style={{ fontSize: density.phone ? 27 : 31, lineHeight: density.phone ? 32 : 36, letterSpacing: -0.7 }}>
            {balanceVisible ? primaryBalance : '••••••••'}
          </VadText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingRight: 94 }}>
            {hasBalanceTrend && balanceChange !== null ? (
              <VadText variant="caption" style={{ color: balanceChange >= 0 ? '#20D99A' : theme.colors.no }}>
                {balanceChange >= 0 ? '▲ +' : '▼ '}{formatMoney(Math.abs(balanceChange), primaryAsset ?? 'NGN')}{balanceChangePercent !== null ? ` (${balanceChangePercent >= 0 ? '+' : ''}${balanceChangePercent.toFixed(1)}%)` : ''} · 30d
              </VadText>
            ) : (
              <VadText variant="caption" tone="secondary">{primaryAsset ? `${primaryAsset} wallet balance` : 'No enabled wallet currency'}</VadText>
            )}
            {secondaryBalances.map((item) => (
              <VadText key={item.code} variant="caption" tone="secondary">
                · {item.code} {balanceVisible ? formatMoney(item.total, item.code) : '••••'}
              </VadText>
            ))}
          </View>
          <View style={{ position: 'absolute', right: 10, bottom: 12, opacity: 0.9 }}>
            {historyValues.length > 1 ? <BalanceSparkline values={historyValues} /> : <VadIcon name="wallet" size={38} tone="brand" />}
          </View>
        </View>
      </TourTarget>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6, paddingTop: 1, paddingBottom: 1 }}>
        <QuickAction label="Deposit" icon="plus" color="#20D99A" onPress={onDeposit} />
        <QuickAction label="Withdraw" icon="wallet" color="#625BFF" onPress={onWithdraw} />
        <QuickAction label="Predict" icon="arrowUp" color="#3298F5" onPress={() => onExploreMarkets()} />
        <QuickAction label="Send" icon="share" color="#253246" onPress={onSend} />
      </View>

      {promotions.length ? (
        promotionsToShow.length ? (
          <View style={{ position: 'relative' }}>
            <HomePromotionCarousel promotions={promotionsToShow} onOpen={onOpenPromotion} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss promotions"
              onPress={() => setDismissedPromotionSignature(promotionSignature)}
              style={{ position: 'absolute', top: 7, right: 7, zIndex: 2, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(9, 13, 31, 0.78)' }}
            >
              <VadIcon name="close" size={17} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : null
      ) : !promotionPlaceholderDismissed ? (
        <View style={{ minHeight: density.compact ? 104 : 118, overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: '#3436B9', backgroundColor: '#202A82', paddingHorizontal: 14, paddingVertical: 10, paddingRight: 106, justifyContent: 'center', gap: 4 }}>
          <View pointerEvents="none" style={{ position: 'absolute', right: -30, top: -48, width: 190, height: 190, borderRadius: 95, borderWidth: 28, borderColor: '#4B52E8', opacity: 0.45 }} />
          <View pointerEvents="none" style={{ position: 'absolute', right: 22, bottom: -70, width: 175, height: 150, borderRadius: 88, backgroundColor: '#3639C7', opacity: 0.55, transform: [{ rotate: '-22deg' }] }} />
          <VadText variant="heading" style={{ color: '#FFFFFF', fontSize: density.compact ? 17 : 19, lineHeight: density.compact ? 21 : 24 }}>Discover VAD markets</VadText>
          <VadText variant="caption" style={{ color: '#DDE1FF', fontSize: density.compact ? 11 : 12, lineHeight: density.compact ? 15 : 17 }}>Explore published markets across sports, politics, technology and more.</VadText>
          <Pressable accessibilityRole="button" onPress={() => onExploreMarkets()} style={({ pressed }) => ({ alignSelf: 'flex-start', marginTop: 3, backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 7, opacity: pressed ? 0.82 : 1 })}>
            <VadText variant="caption" style={{ color: '#282D9B', fontWeight: '700' }}>Explore markets ›</VadText>
          </Pressable>
          <View pointerEvents="none" style={{ position: 'absolute', right: 20, top: 22, width: 62, height: 62, borderRadius: 31, backgroundColor: '#4D52E9', borderWidth: 1, borderColor: '#777BFF', alignItems: 'center', justifyContent: 'center' }}>
            <VadText style={{ fontSize: 32, lineHeight: 38 }}>↗</VadText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss market discovery banner" onPress={() => setPromotionPlaceholderDismissed(true)} style={{ position: 'absolute', top: 7, right: 7, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: 'rgba(9, 13, 31, 0.35)' }}>
            <VadIcon name="close" size={17} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}

      <TourTarget id="home-watchlist">
        <View style={{ gap: 9 }}>
          <SectionHeading title="Watchlist" action="See all" onAction={() => onExploreMarkets('watchlist')} />
          {watchlistError && watchlistMarkets.length ? <VadText variant="caption" tone="danger">{watchlistError}</VadText> : null}
          {watchlistLoading ? (
            <View style={{ borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 14 }}>
              <VadText variant="caption" tone="secondary">Loading your saved markets…</VadText>
            </View>
          ) : watchlistMarkets.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingRight: 3 }}>
              {watchlistMarkets.map((market) => (
                <View key={market.instrument_public_id} style={{ width: density.phone ? 156 : 220, minHeight: 98, borderRadius: 17, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 11, gap: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <Pressable accessibilityRole="button" onPress={() => onOpenMarket(market)} style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
                      <MarketThumb market={market} size={38} />
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <VadText variant="caption" numberOfLines={3} style={{ fontSize: 12, lineHeight: 15 }}>{market.title}</VadText>
                        <VadText variant="caption" tone="yes" style={{ fontWeight: '700' }}>Yes · {formatProbability(market.yes_price)}</VadText>
                      </View>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Remove from watchlist" disabled={watchlistBusyId === market.instrument_public_id} onPress={() => void toggleWatchlist(market.instrument_public_id)} hitSlop={8}>
                      <VadIcon name="close" size={15} tone="secondary" />
                    </Pressable>
                  </View>
                  {marketHistoryById[market.instrument_public_id]?.length > 1 ? <MarketSparkline values={marketHistoryById[market.instrument_public_id]} /> : null}
                </View>
              ))}
            </ScrollView>
          ) : marketError && watchlistIds.length ? (
            <View style={{ borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 14, gap: 8 }}>
              <VadText variant="bodyStrong">Saved markets temporarily unavailable</VadText>
              <VadText variant="caption" tone="secondary">Your saved markets are safe. The market catalogue could not be refreshed.</VadText>
              <Pressable accessibilityRole="button" onPress={onRetryMarkets} style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: theme.colors.brandSoft }}>
                <VadText variant="caption" tone="brand">Retry market data</VadText>
              </Pressable>
            </View>
          ) : watchlistError ? (
            <View style={{ borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 14, gap: 8 }}>
              <VadText variant="bodyStrong">Watchlist unavailable</VadText>
              <VadText variant="caption" tone="secondary">We could not load your saved markets.</VadText>
              <Pressable accessibilityRole="button" onPress={() => void retryWatchlist()} style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: theme.colors.brandSoft }}>
                <VadText variant="caption" tone="brand">Try again</VadText>
              </Pressable>
            </View>
          ) : (
            <View style={{ borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 14, gap: 7 }}>
              <VadText variant="bodyStrong">Your watchlist is empty</VadText>
              <VadText variant="caption" tone="secondary">Save markets to keep their latest prices and trends close by.</VadText>
              <Pressable accessibilityRole="button" onPress={() => onExploreMarkets()} style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: theme.colors.brandSoft }}>
                <VadText variant="caption" tone="brand">Browse markets</VadText>
              </Pressable>
            </View>
          )}
        </View>
      </TourTarget>

      <TourTarget id="home-categories">
        <View style={{ gap: 9 }}>
          <SectionHeading title="🔥 Trending Markets" action="See all" onAction={() => onExploreMarkets()} />
          {marketError && trendingRows.length ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
              <View style={{ flex: 1 }}>
                <VadText variant="caption" tone="secondary">Showing previously loaded market data. Refresh failed.</VadText>
              </View>
              <Pressable accessibilityRole="button" onPress={onRetryMarkets} hitSlop={6}>
                <VadText variant="caption" tone="brand">Retry</VadText>
              </Pressable>
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
            {availableCategories.map((item) => (
              <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} style={{ minHeight: 35, justifyContent: 'center', paddingHorizontal: 15, borderRadius: 20, backgroundColor: category === item ? theme.colors.brandPrimary : theme.colors.surface, borderWidth: 1, borderColor: category === item ? theme.colors.brandPrimary : theme.colors.border }}>
                <VadText variant="caption" tone={category === item ? 'inverse' : 'secondary'}>{item}</VadText>
              </Pressable>
            ))}
          </ScrollView>
          {trendingSettings.enabled && trendingRows.length ? trendingRows.map(({ entry, market }) => (
            <View key={market.instrument_public_id} style={{ minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8, paddingHorizontal: 2, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <Pressable accessibilityRole="button" onPress={() => onOpenMarket(market)} style={({ pressed }) => ({ flexDirection: 'row', flex: 1, minWidth: 0, alignItems: 'center', gap: 10, opacity: pressed ? 0.75 : 1 })}>
                <MarketThumb market={market} />
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <VadText variant="bodyStrong" numberOfLines={2} style={{ fontSize: 13, lineHeight: 17 }}>{market.title}</VadText>
                  <VadText variant="caption" tone="secondary">{formatVolume(market.total_volume, market.asset_code)} volume</VadText>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3, minWidth: 54 }}>
                  <VadText variant="bodyStrong" style={{ fontSize: 14 }}>{formatProbability(market.yes_price)}</VadText>
                  <VadText variant="caption" tone={Number(entry.price_movement) >= 0 ? 'yes' : 'no'}>{Number(entry.price_movement) > 0 ? '▲ ' : Number(entry.price_movement) < 0 ? '▼ ' : ''}{Math.abs(Number(entry.price_movement) || 0).toFixed(1)}%</VadText>
                </View>
                <VadIcon name="chevronRight" size={17} tone="tertiary" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={watchlistIds.includes(market.instrument_public_id) ? 'Remove from watchlist' : 'Add to watchlist'}
                accessibilityState={{ selected: watchlistIds.includes(market.instrument_public_id), disabled: watchlistBusyId === market.instrument_public_id }}
                disabled={watchlistBusyId === market.instrument_public_id}
                onPress={() => void toggleWatchlist(market.instrument_public_id)}
                style={({ pressed }) => ({ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}
              >
                <VadIcon name="bookmark" size={18} tone={watchlistIds.includes(market.instrument_public_id) ? 'brand' : 'secondary'} />
              </Pressable>
            </View>
          )) : marketError ? (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 8 }}>
              <VadText variant="bodyStrong">Market data unavailable</VadText>
              <VadText variant="caption" tone="secondary">{marketError}</VadText>
              <Pressable accessibilityRole="button" onPress={onRetryMarkets} style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: theme.colors.brandSoft }}>
                <VadText variant="caption" tone="brand">Try again</VadText>
              </Pressable>
            </View>
          ) : (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
              <VadText variant="caption" tone="secondary">{trendingSettings.enabled ? 'No trending markets are available for the selected category right now.' : 'Trending markets are currently disabled.'}</VadText>
            </View>
          )}
        </View>
      </TourTarget>
    </View>
  );
}

function HomeHeaderAction({ label, icon, badge = false, onPress }: { label: string; icon: 'search' | 'bell' | 'activity'; badge?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: 'transparent', opacity: pressed ? 0.7 : 1 })}><VadIcon name={icon} size={21} tone="secondary" />{badge ? <View style={{ position: 'absolute', right: 3, top: 3, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.no, borderWidth: 1, borderColor: theme.colors.background }} /> : null}</Pressable>;
}

function QuickAction({ label, icon, color, onPress }: { label: string; icon: 'plus' | 'wallet' | 'arrowUp' | 'share'; color: string; onPress: () => void }) {
  const theme = useVadTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, minWidth: 0, alignItems: 'center', gap: 6, opacity: pressed ? 0.72 : 1 })}><View style={{ width: 52, height: 52, borderRadius: 28, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}><VadIcon name={icon} size={24} tone="inverse" /></View><VadText variant="caption" style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>{label}</VadText></Pressable>;
}

function SectionHeading({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  const theme = useVadTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><VadText variant="heading" style={{ fontSize: 18 }}>{title}</VadText><Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}><VadText variant="caption" style={{ color: theme.colors.brandPrimary, fontWeight: '600' }}>{action}</VadText></Pressable></View>;
}

function MarketThumb({ market, size = 46 }: { market: MarketCatalogItem; size?: number }) {
  return <MarketThumbnail market={market} size={size} />;
}

function MarketSparkline({ values }: { values: number[] }) {
  const [chartWidth, setChartWidth] = useState(0);
  const samples = values.slice(-18);
  if (samples.length < 2) return null;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min || 1;
  const width = Math.max(100, chartWidth || 132);
  const height = 20;
  const padding = 2;
  const points = samples.map((value, index) => ({
    x: padding + (index / (samples.length - 1)) * (width - padding * 2),
    y: height - padding - ((value - min) / range) * (height - padding * 2),
  }));
  return (
    <View accessibilityLabel="Executed YES price history" onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)} style={{ width: '100%', height, overflow: 'hidden' }}>
      {points.slice(0, -1).map((point, index) => {
        const next = points[index + 1];
        const dx = next.x - point.x;
        const dy = next.y - point.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        return <View key={index} style={{ position: 'absolute', left: (point.x + next.x) / 2 - length / 2, top: (point.y + next.y) / 2 - 1, width: length, height: 2, borderRadius: 2, backgroundColor: '#20D99A', transform: [{ rotate: `${angle}deg` }] }} />;
      })}
    </View>
  );
}

function BalanceSparkline({ values }: { values: number[] }) {
  const samples = values.slice(-14);
  if (samples.length < 2) return null;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min || 1;
  const width = 94;
  const height = 32;
  const padding = 3;
  const points = samples.map((value, index) => ({
    x: padding + (index / (samples.length - 1)) * (width - padding * 2),
    y: height - padding - ((value - min) / range) * (height - padding * 2),
  }));
  return (
    <View accessibilityLabel="30-day wallet balance history" style={{ width, height, overflow: 'hidden' }}>
      {points.slice(0, -1).map((point, index) => {
        const next = points[index + 1];
        const dx = next.x - point.x;
        const dy = next.y - point.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              left: (point.x + next.x) / 2 - length / 2,
              top: (point.y + next.y) / 2 - 1,
              width: length,
              height: 2,
              borderRadius: 2,
              backgroundColor: '#20D99A',
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        );
      })}
      <View style={{ position: 'absolute', left: points[points.length - 1].x - 3, top: points[points.length - 1].y - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: '#20D99A' }} />
    </View>
  );
}

function getGreeting() { const hour = new Date().getHours(); return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'; }
function categoryMatches(value: string | null, category: Category) {
  if (category === 'All') return true;
  return (value ?? '').trim().toLocaleLowerCase() === category.trim().toLocaleLowerCase();
}
function formatMoney(value: number, asset: string) {
  const number = value.toLocaleString(asset === 'NGN' ? 'en-NG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (asset === 'NGN') return '₦' + number;
  return asset === 'TNGN' ? `TNGN ${number}` : `${number} USDC`;
}
function formatProbability(value: number | string | null | undefined) { const n = Number(value); return Number.isFinite(n) ? `${Math.round(n <= 1 ? n * 100 : n)}%` : '—'; }
function formatVolume(value: number | string | null | undefined, asset: string) { const n = Number(value); if (!Number.isFinite(n)) return 'Volume unavailable'; const compact = new Intl.NumberFormat(asset === 'NGN' ? 'en-NG' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n); return asset === 'NGN' ? `₦${compact}` : `${compact} USDC`; }
