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

type Category = 'All' | 'Sports' | 'Politics' | 'Economy' | 'Tech' | 'Entertainment';

export function HomeScreen({
  markets, wallets, promotions, trendingMarkets, trendingSettings, marketError, onRetryMarkets,
  userName, userId, hasUnreadNotifications, onOpenMarket, onOpenPromotion, onExploreMarkets, onNotifications, onDeposit, onWithdraw, onSend,
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
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const now = useLiveNow();
  const { enabledCurrencies } = useCurrencyPreference();
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
  const trendingRows = useMemo(() => trendingMarkets
    .map((entry) => ({ entry, market: visibleMarkets.find((market) => market.instrument_public_id === entry.instrument_public_id) }))
    .filter((row): row is { entry: TrendingMarketRow; market: MarketCatalogItem } => Boolean(row.market))
    .filter(({ market }) => category === 'All' || categoryMatches(market.category, category))
    .slice(0, 5), [trendingMarkets, visibleMarkets, category]);
  const watchlistMarkets = useMemo(() => watchlistIds
    .map((id) => visibleMarkets.find((market) => market.instrument_public_id === id))
    .filter((market): market is MarketCatalogItem => Boolean(market))
    .slice(0, 10), [watchlistIds, visibleMarkets]);
  const walletRows = wallets.filter((wallet) => enabledCurrencies.includes(wallet.asset_code as VADCurrency));
  const totalNgn = walletRows.filter((wallet) => wallet.asset_code === 'NGN').reduce((sum, wallet) => sum + Number(wallet.available || 0) + Number(wallet.reserved || 0) + Number(wallet.withdrawal_pending || 0), 0);
  const totalUsdc = walletRows.filter((wallet) => wallet.asset_code === 'USDC').reduce((sum, wallet) => sum + Number(wallet.available || 0) + Number(wallet.reserved || 0) + Number(wallet.withdrawal_pending || 0), 0);
  const promotionSignature = promotions.map((promotion) => promotion.public_id).join('|');
  const promotionsToShow = dismissedPromotionSignature === promotionSignature ? [] : promotions;
  const primaryAsset = walletRows.some((wallet) => wallet.asset_code === 'NGN') ? 'NGN' : walletRows.some((wallet) => wallet.asset_code === 'USDC') ? 'USDC' : null;
  const primaryBalance = primaryAsset === 'NGN' ? formatMoney(totalNgn, 'NGN') : primaryAsset === 'USDC' ? formatMoney(totalUsdc, 'USDC') : '—';
  const primaryHistory = balanceHistory.filter((point) => point.asset_code === primaryAsset).sort((a, b) => a.observed_on.localeCompare(b.observed_on));
  const historyValues = primaryHistory.map((point) => Number(point.balance)).filter(Number.isFinite);
  const hasBalanceTrend = historyValues.length > 1 && historyValues.some((value) => value !== historyValues[0]);
  const balanceChange = hasBalanceTrend ? historyValues[historyValues.length - 1] - historyValues[0] : null;
  const balanceChangePercent = balanceChange !== null && historyValues[0] !== 0 ? (balanceChange / Math.abs(historyValues[0])) * 100 : null;

  return (
    <View style={{ width: '100%', gap: density.compact ? 13 : 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 }}>
        <View style={{ width: 43, height: 43, borderRadius: 22, overflow: 'hidden', backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
          {profileAvatarUrl ? <Image source={{ uri: profileAvatarUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : <VadIcon name="account" size={23} tone="secondary" />}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <VadText variant="caption" tone="secondary">Good {getGreeting()},</VadText>
          <VadText variant="bodyStrong" style={{ fontSize: 18, lineHeight: 22 }}>{(profileName || userName || 'VAD member').trim().split(/\s+/)[0]}</VadText>
        </View>
        <HomeHeaderAction label="Search markets" icon="search" onPress={() => onExploreMarkets()} />
        <HomeHeaderAction label="Notifications" icon="bell" badge={hasUnreadNotifications} onPress={onNotifications} />
      </View>

      <TourTarget id="home-overview">
        <View style={{ padding: density.compact ? 14 : 16, minHeight: density.compact ? 122 : 132, overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: theme.mode === 'dark' ? '#123B3B' : theme.colors.border, backgroundColor: theme.mode === 'dark' ? '#071B1D' : theme.colors.surface, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <VadText variant="body" tone="secondary">Total balance</VadText>
            <Pressable accessibilityRole="button" accessibilityLabel={balanceVisible ? 'Hide balance' : 'Show balance'} onPress={() => setBalanceVisible((visible) => !visible)} hitSlop={10}>
              <VadIcon name={balanceVisible ? 'eye' : 'eyeOff'} size={19} tone="secondary" />
            </Pressable>
          </View>
          <VadText variant="title" style={{ fontSize: density.phone ? 30 : 34, lineHeight: density.phone ? 35 : 39, letterSpacing: -0.8 }}>
            {balanceVisible ? primaryBalance : '••••••••'}
          </VadText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', paddingRight: 112 }}>
            {hasBalanceTrend && balanceChange !== null ? (
              <VadText variant="caption" style={{ color: balanceChange >= 0 ? '#20D99A' : theme.colors.no }}>
                {balanceChange >= 0 ? '▲ +' : '▼ '}{formatMoney(Math.abs(balanceChange), primaryAsset ?? 'NGN')}{balanceChangePercent !== null ? ` (${balanceChangePercent >= 0 ? '+' : ''}${balanceChangePercent.toFixed(1)}%)` : ''} · 30d
              </VadText>
            ) : (
              <VadText variant="caption" tone="secondary">{primaryAsset ? `${primaryAsset} wallet balance` : 'No enabled wallet currency'}</VadText>
            )}
            {walletRows.some((wallet) => wallet.asset_code === 'NGN' && Number(wallet.available) > 0) && walletRows.some((wallet) => wallet.asset_code === 'USDC' && Number(wallet.available) > 0) ? (
              <VadText variant="caption" tone="secondary">· USDC {balanceVisible ? totalUsdc.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '••••'}</VadText>
            ) : null}
          </View>
          <View style={{ position: 'absolute', right: 12, bottom: 18, opacity: 0.95 }}>
            {hasBalanceTrend ? <BalanceSparkline values={historyValues} /> : <VadIcon name="wallet" size={48} tone="brand" />}
          </View>
        </View>
      </TourTarget>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
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
        <View style={{ minHeight: density.compact ? 112 : 126, overflow: 'hidden', borderRadius: 17, borderWidth: 1, borderColor: '#3436B9', backgroundColor: '#202A82', paddingHorizontal: 16, paddingVertical: 13, paddingRight: 118, justifyContent: 'center', gap: 5 }}>
          <View pointerEvents="none" style={{ position: 'absolute', right: -30, top: -48, width: 190, height: 190, borderRadius: 95, borderWidth: 28, borderColor: '#4B52E8', opacity: 0.45 }} />
          <View pointerEvents="none" style={{ position: 'absolute', right: 22, bottom: -70, width: 175, height: 150, borderRadius: 88, backgroundColor: '#3639C7', opacity: 0.55, transform: [{ rotate: '-22deg' }] }} />
          <VadText variant="heading" style={{ color: '#FFFFFF', fontSize: density.compact ? 17 : 19, lineHeight: density.compact ? 21 : 24 }}>Discover VAD markets</VadText>
          <VadText variant="caption" style={{ color: '#DDE1FF', fontSize: density.compact ? 11 : 12, lineHeight: density.compact ? 15 : 17 }}>Explore published markets across sports, politics, technology and more.</VadText>
          <Pressable accessibilityRole="button" onPress={() => onExploreMarkets()} style={({ pressed }) => ({ alignSelf: 'flex-start', marginTop: 3, backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 7, opacity: pressed ? 0.82 : 1 })}>
            <VadText variant="caption" style={{ color: '#282D9B', fontWeight: '700' }}>Explore markets ›</VadText>
          </Pressable>
          <View pointerEvents="none" style={{ position: 'absolute', right: 20, top: 22, width: 76, height: 76, borderRadius: 38, backgroundColor: '#4D52E9', borderWidth: 1, borderColor: '#777BFF', alignItems: 'center', justifyContent: 'center' }}>
            <VadText style={{ fontSize: 39, lineHeight: 46 }}>↗</VadText>
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
              <VadText variant="caption" tone="secondary">We couldn't load your saved markets.</VadText>
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
            {(['All', 'Sports', 'Politics', 'Economy', 'Tech', 'Entertainment'] as Category[]).map((item) => (
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
          {!marketError && !activeMarkets.length ? <VadText variant="caption" tone="tertiary">No markets are currently open for trading.</VadText> : null}
        </View>
      </TourTarget>
    </View>
  );
}

function HomeHeaderAction({ label, icon, badge = false, onPress }: { label: string; icon: 'search' | 'bell'; badge?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: theme.colors.surface, opacity: pressed ? 0.7 : 1 })}><VadIcon name={icon} size={21} tone="secondary" />{badge ? <View style={{ position: 'absolute', right: 3, top: 3, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.no, borderWidth: 1, borderColor: theme.colors.background }} /> : null}</Pressable>;
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
  const theme = useVadTheme();
  const mediaUrl = market.media_path ? (/^https?:\/\//i.test(market.media_path) ? market.media_path : supabase.storage.from('market-media').getPublicUrl(market.media_path).data.publicUrl) : null;
  const category = market.category?.toLowerCase() ?? '';
  const icon = category.includes('sport') ? 'activity' : category.includes('tech') ? 'operations' : category.includes('polit') ? 'community' : category.includes('econom') ? 'markets' : 'activity';
  return <View style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border }}>{mediaUrl ? <Image source={{ uri: mediaUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : <VadIcon name={icon as 'activity'} size={Math.round(size * 0.5)} tone="secondary" />}</View>;
}

function MarketSparkline({ values }: { values: number[] }) {
  const theme = useVadTheme();
  const samples = values.slice(-18);
  if (samples.length < 2) return null;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min || 1;
  const width = 180;
  const height = 20;
  const padding = 2;
  const points = samples.map((value, index) => ({
    x: padding + (index / (samples.length - 1)) * (width - padding * 2),
    y: height - padding - ((value - min) / range) * (height - padding * 2),
  }));
  return (
    <View accessibilityLabel="Executed YES price history" style={{ width: '100%', height, overflow: 'hidden' }}>
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
  const theme = useVadTheme();
  const samples = values.slice(-14);
  if (samples.length < 2) return null;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min || 1;
  const width = 116;
  const height = 43;
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
  const text = (value ?? '').toLowerCase();
  if (category === 'Sports') return text.includes('sport') || text.includes('football') || text.includes('basketball');
  if (category === 'Politics') return text.includes('polit') || text.includes('election') || text.includes('government');
  if (category === 'Economy') return text.includes('econom') || text.includes('finance') || text.includes('market');
  if (category === 'Tech') return text.includes('tech') || text.includes('ai') || text.includes('crypto');
  if (category === 'Entertainment') return text.includes('entertain') || text.includes('movie') || text.includes('music');
  return true;
}
function formatMoney(value: number, asset: string) { return asset === 'NGN' ? '₦' + value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USDC'; }
function formatProbability(value: number | string | null | undefined) { const n = Number(value); return Number.isFinite(n) ? `${Math.round(n <= 1 ? n * 100 : n)}%` : '—'; }
function formatVolume(value: number | string | null | undefined, asset: string) { const n = Number(value); if (!Number.isFinite(n)) return 'Volume unavailable'; const prefix = asset === 'NGN' ? '₦' : ''; return prefix + n.toLocaleString(asset === 'NGN' ? 'en-NG' : 'en-US', { maximumFractionDigits: 0 }); }
