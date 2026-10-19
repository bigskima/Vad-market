import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { HomePromotionCarousel } from '@/features/home/components/home-promotion-carousel';
import { TourTarget } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useLiveNow } from '@/hooks/use-live-now';
import { getMarketTiming } from '@/lib/market-timing';
import { useVadTheme } from '@/providers/theme-provider';
import { useCurrencyPreference, type VADCurrency } from '@/providers/currency-preference-provider';
import type { FeaturedMarketRow, FeaturedMarketSettings, HomePromotion, TrendingMarketRow, TrendingMarketSettings } from '@/services/home-content-api';
import type { MarketCatalogItem, WalletRow } from '@/services/market-api';

type Category = 'All' | 'Sports' | 'Politics' | 'Economy' | 'Tech' | 'Entertainment';

export function HomeScreen({
  markets, wallets, promotions, featuredMarkets, trendingMarkets, featuredSettings, trendingSettings,
  userName, onOpenMarket, onOpenPromotion, onExploreMarkets, onNotifications, onDeposit, onWithdraw, onSend,
}: {
  markets: MarketCatalogItem[];
  wallets: WalletRow[];
  promotions: HomePromotion[];
  featuredMarkets: FeaturedMarketRow[];
  trendingMarkets: TrendingMarketRow[];
  featuredSettings: FeaturedMarketSettings;
  trendingSettings: TrendingMarketSettings;
  userName: string;
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
  const [dismissedPromotion, setDismissedPromotion] = useState<string | null>(null);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const visibleMarkets = markets.filter((market) => enabledCurrencies.includes(market.asset_code as VADCurrency));
  const activeMarkets = visibleMarkets.filter((market) => getMarketTiming(market, now).tradingOpen && market.resolution_status !== 'RESOLVED');
  const trendingRows = useMemo(() => trendingMarkets
    .map((entry) => ({ entry, market: visibleMarkets.find((market) => market.instrument_public_id === entry.instrument_public_id) }))
    .filter((row): row is { entry: TrendingMarketRow; market: MarketCatalogItem } => Boolean(row.market))
    .filter(({ market }) => category === 'All' || categoryMatches(market.category, category))
    .slice(0, 5), [trendingMarkets, visibleMarkets, category]);
  const featuredRows = useMemo(() => featuredMarkets
    .map((entry) => ({ entry, market: visibleMarkets.find((market) => market.instrument_public_id === entry.instrument_public_id) }))
    .filter((row): row is { entry: FeaturedMarketRow; market: MarketCatalogItem } => Boolean(row.market))
    .slice(0, 5), [featuredMarkets, visibleMarkets]);
  const walletRows = wallets.filter((wallet) => enabledCurrencies.includes(wallet.asset_code as VADCurrency));
  const totalNgn = walletRows.filter((wallet) => wallet.asset_code === 'NGN').reduce((sum, wallet) => sum + Number(wallet.available || 0) + Number(wallet.reserved || 0) + Number(wallet.withdrawal_pending || 0), 0);
  const totalUsdc = walletRows.filter((wallet) => wallet.asset_code === 'USDC').reduce((sum, wallet) => sum + Number(wallet.available || 0) + Number(wallet.reserved || 0) + Number(wallet.withdrawal_pending || 0), 0);
  const promotionsToShow = promotions.filter((promotion) => promotion.public_id !== dismissedPromotion);
  const primaryBalance = walletRows.some((wallet) => wallet.asset_code === 'NGN') ? formatMoney(totalNgn, 'NGN') : walletRows.some((wallet) => wallet.asset_code === 'USDC') ? formatMoney(totalUsdc, 'USDC') : '—';

  return (
    <View style={{ width: '100%', gap: density.compact ? 14 : 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 }}>
        <View style={{ width: 43, height: 43, borderRadius: 22, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <VadIcon name="account" size={23} tone="secondary" />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <VadText variant="caption" tone="secondary">Good {getGreeting()},</VadText>
          <VadText variant="bodyStrong" style={{ fontSize: 18, lineHeight: 22 }}>{userName || 'VAD member'}</VadText>
        </View>
        <HomeHeaderAction label="Search markets" icon="search" onPress={() => onExploreMarkets()} />
        <HomeHeaderAction label="Notifications" icon="bell" onPress={onNotifications} />
      </View>

      <TourTarget id="home-overview">
        <View style={{ padding: density.compact ? 17 : 20, minHeight: 150, overflow: 'hidden', borderRadius: 23, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 9 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <VadText variant="body" tone="secondary">Total balance</VadText>
            <Pressable accessibilityRole="button" accessibilityLabel={balanceVisible ? 'Hide balance' : 'Show balance'} onPress={() => setBalanceVisible((visible) => !visible)} hitSlop={10}>
              <VadIcon name={balanceVisible ? 'account' : 'activity'} size={19} tone="secondary" />
            </Pressable>
          </View>
          <VadText variant="title" style={{ fontSize: density.phone ? 31 : 36, lineHeight: density.phone ? 37 : 42, letterSpacing: -0.8 }}>
            {balanceVisible ? primaryBalance : '••••••••'}
          </VadText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <VadText variant="caption" tone="secondary">
              {walletRows.length ? (walletRows.some((wallet) => wallet.asset_code === 'NGN') ? 'NGN wallet balance' : 'USDC wallet balance') : 'Balance unavailable'}
            </VadText>
            {walletRows.some((wallet) => wallet.asset_code === 'NGN' && Number(wallet.available) > 0) && walletRows.some((wallet) => wallet.asset_code === 'USDC' && Number(wallet.available) > 0) ? (
              <VadText variant="caption" tone="secondary">· USDC {balanceVisible ? totalUsdc.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '••••'}</VadText>
            ) : null}
          </View>
          <View style={{ position: 'absolute', right: 8, bottom: 7, opacity: 0.13 }}>
            <VadIcon name="wallet" size={88} tone="brand" />
          </View>
        </View>
      </TourTarget>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <QuickAction label="Deposit" icon="plus" color="#20D99A" onPress={onDeposit} />
        <QuickAction label="Withdraw" icon="wallet" color="#625BFF" onPress={onWithdraw} />
        <QuickAction label="Predict" icon="arrowUp" color="#3298F5" onPress={() => onExploreMarkets()} />
        <QuickAction label="Send" icon="share" color="#253246" onPress={onSend} />
      </View>

      {promotionsToShow.length ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <VadText variant="bodyStrong">Highlights</VadText>
            <Pressable onPress={() => setDismissedPromotion(promotionsToShow[0]?.public_id ?? null)} accessibilityRole="button" accessibilityLabel="Dismiss promotion">
              <VadIcon name="x" size={17} tone="secondary" />
            </Pressable>
          </View>
          <HomePromotionCarousel promotions={promotionsToShow} onOpen={onOpenPromotion} />
        </View>
      ) : null}

      <TourTarget id="home-featured-markets">
        <View style={{ gap: 9 }}>
          <SectionHeading title="Featured markets" action="See all" onAction={() => onExploreMarkets()} />
          {featuredRows.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingRight: 3 }}>
              {featuredRows.map(({ market }) => (
                <Pressable key={market.instrument_public_id} accessibilityRole="button" onPress={() => onOpenMarket(market)} style={({ pressed }) => ({ width: density.phone ? 204 : 220, minHeight: 115, borderRadius: 17, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 11, gap: 6, opacity: pressed ? 0.8 : 1 })}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <MarketThumb market={market} />
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <VadText variant="caption" numberOfLines={3} style={{ fontSize: 12, lineHeight: 15 }}>{market.title}</VadText>
                      <VadText variant="caption" tone="yes" style={{ fontWeight: '700' }}>Yes · {formatProbability(market.yes_price)}</VadText>
                    </View>
                  </View>
                  <View style={{ flex: 1 }} />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={{ borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 14 }}>
              <VadText variant="caption" tone="secondary">{featuredSettings.enabled ? 'Featured markets will appear here when VAD publishes them.' : 'Featured markets are currently disabled by VAD.'}</VadText>
            </View>
          )}
        </View>
      </TourTarget>

      <TourTarget id="home-categories">
        <View style={{ gap: 9 }}>
          <SectionHeading title="🔥 Trending Markets" action="See all" onAction={() => onExploreMarkets()} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
            {(['All', 'Sports', 'Politics', 'Economy', 'Tech', 'Entertainment'] as Category[]).map((item) => (
              <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} style={{ minHeight: 35, justifyContent: 'center', paddingHorizontal: 15, borderRadius: 20, backgroundColor: category === item ? theme.colors.brandPrimary : theme.colors.surface, borderWidth: 1, borderColor: category === item ? theme.colors.brandPrimary : theme.colors.border }}>
                <VadText variant="caption" tone={category === item ? 'inverse' : 'secondary'}>{item}</VadText>
              </Pressable>
            ))}
          </ScrollView>
          {trendingSettings.enabled && trendingRows.length ? trendingRows.map(({ entry, market }) => (
            <Pressable key={market.instrument_public_id} accessibilityRole="button" onPress={() => onOpenMarket(market)} style={({ pressed }) => ({ minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 3, borderBottomWidth: 1, borderBottomColor: theme.colors.border, opacity: pressed ? 0.75 : 1 })}>
              <MarketThumb market={market} />
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <VadText variant="bodyStrong" numberOfLines={2} style={{ fontSize: 13, lineHeight: 17 }}>{market.title}</VadText>
                <VadText variant="caption" tone="secondary">{formatVolume(market.total_volume, market.asset_code)} volume</VadText>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <VadText variant="bodyStrong" style={{ fontSize: 14 }}>{formatProbability(market.yes_price)}</VadText>
                <VadText variant="caption" tone={Number(entry.price_movement) >= 0 ? 'yes' : 'no'}>{Number(entry.price_movement) > 0 ? '▲ ' : Number(entry.price_movement) < 0 ? '▼ ' : ''}{Math.abs(Number(entry.price_movement) || 0).toFixed(1)}%</VadText>
              </View>
              <VadIcon name="chevronRight" size={17} tone="tertiary" />
            </Pressable>
          )) : (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
              <VadText variant="caption" tone="secondary">{trendingSettings.enabled ? 'No trending markets are available for the selected category right now.' : 'Trending markets are currently disabled.'}</VadText>
            </View>
          )}
          {!activeMarkets.length ? <VadText variant="caption" tone="tertiary">No markets are currently open for trading.</VadText> : null}
        </View>
      </TourTarget>
    </View>
  );
}

function HomeHeaderAction({ label, icon, onPress }: { label: string; icon: 'search' | 'bell'; onPress: () => void }) {
  const theme = useVadTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: theme.colors.surface, opacity: pressed ? 0.7 : 1 })}><VadIcon name={icon} size={21} tone="secondary" /></Pressable>;
}

function QuickAction({ label, icon, color, onPress }: { label: string; icon: 'plus' | 'wallet' | 'arrowUp' | 'share'; color: string; onPress: () => void }) {
  const theme = useVadTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, minWidth: 0, alignItems: 'center', gap: 6, opacity: pressed ? 0.72 : 1 })}><View style={{ width: 52, height: 52, borderRadius: 28, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}><VadIcon name={icon} size={24} tone="inverse" /></View><VadText variant="caption" style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>{label}</VadText></Pressable>;
}

function SectionHeading({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  const theme = useVadTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><VadText variant="heading" style={{ fontSize: 18 }}>{title}</VadText><Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}><VadText variant="caption" style={{ color: theme.colors.brandPrimary, fontWeight: '600' }}>{action}</VadText></Pressable></View>;
}

function MarketThumb({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const category = market.category?.toLowerCase() ?? '';
  const icon = category.includes('sport') ? 'activity' : category.includes('tech') ? 'operations' : category.includes('polit') ? 'community' : category.includes('econom') ? 'markets' : 'activity';
  return <View style={{ width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border }}><VadIcon name={icon as 'activity'} size={23} tone="secondary" /></View>;
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
