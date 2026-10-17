import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadProgressiveSection } from '@/components/ui/vad-progressive-section';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadText } from '@/components/ui/vad-text';
import { HomePromotionCarousel } from '@/features/home/components/home-promotion-carousel';
import { MarketCard } from '@/features/markets/components/market-card';
import { probability } from '@/features/markets/format';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { TourTarget } from '@/features/tour/tour-provider';
import { useLiveNow } from '@/hooks/use-live-now';
import { useProductDensity } from '@/hooks/use-product-density';
import { getMarketTiming } from '@/lib/market-timing';
import { useVadTheme } from '@/providers/theme-provider';
import type {
  FeaturedMarketRow,
  FeaturedMarketSettings,
  HomePromotion,
  TrendingMarketRow,
  TrendingMarketSettings,
  VadMarketRow,
} from '@/services/home-content-api';
import type { MarketCatalogItem } from '@/services/market-api';

type MarketLens = 'LIVE' | 'VAD' | 'MOMENTUM';

export function HomeScreen({
  markets,
  promotions,
  vadMarkets,
  featuredMarkets,
  trendingMarkets,
  featuredSettings,
  trendingSettings,
  onOpenMarket,
  onOpenPromotion,
  onExploreMarkets,
  onOpenCommunity,
}: {
  markets: MarketCatalogItem[];
  promotions: HomePromotion[];
  vadMarkets: VadMarketRow[];
  featuredMarkets: FeaturedMarketRow[];
  trendingMarkets: TrendingMarketRow[];
  featuredSettings: FeaturedMarketSettings;
  trendingSettings: TrendingMarketSettings;
  onOpenMarket: (market: MarketCatalogItem) => void;
  onOpenPromotion: (targetPath: string) => void;
  onExploreMarkets: (category?: string) => void;
  onOpenCommunity: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const now = useLiveNow();
  const [lens, setLens] = useState<MarketLens>('LIVE');

  const active = markets.filter((market) => getMarketTiming(market, now).tradingOpen);
  const categories = [...new Set(markets.map((market) => market.category).filter(Boolean))].slice(0, 8) as string[];
  const traded = markets.filter((market) => Boolean(market.last_trade_at)).length;

  const vadRail = vadMarkets
    .map((entry) => ({ entry, market: markets.find((market) => market.instrument_public_id === entry.instrument_public_id) }))
    .filter((row): row is { entry: VadMarketRow; market: MarketCatalogItem } => Boolean(row.market));

  const featuredRail = featuredMarkets
    .map((entry) => ({ entry, market: markets.find((market) => market.instrument_public_id === entry.instrument_public_id) }))
    .filter((row): row is { entry: FeaturedMarketRow; market: MarketCatalogItem } => Boolean(row.market));

  const trendingRail = trendingMarkets
    .map((entry) => ({ entry, market: markets.find((market) => market.instrument_public_id === entry.instrument_public_id) }))
    .filter((row): row is { entry: TrendingMarketRow; market: MarketCatalogItem } => Boolean(row.market));

  const leadMarket = trendingRail[0]?.market ?? featuredRail[0]?.market ?? vadRail[0]?.market ?? active[0];
  const leadDetail = trendingRail[0]
    ? `${formatAcceleration(Math.max(trendingRail[0].entry.volume_acceleration, trendingRail[0].entry.trade_acceleration))} · ${trendingRail[0].entry.unique_traders} traders`
    : featuredRail[0]
      ? `${formatAssetCompact(featuredRail[0].market.total_volume, featuredRail[0].market.asset_code)} completed activity`
      : leadMarket
        ? `${leadMarket.category ?? 'General'} · ${leadMarket.asset_code}`
        : '';

  const lensMarkets = lens === 'VAD'
    ? vadRail.map((row) => row.market)
    : lens === 'MOMENTUM'
      ? trendingSettings.enabled ? trendingRail.map((row) => row.market) : []
      : active;

  const sectionGap = density.compact ? theme.spacing.md : theme.spacing.lg;

  return (
    <View style={{ gap: sectionGap, width: '100%' }}>
      <TourTarget id="home-overview">
        <View style={{
          overflow: 'hidden',
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.brandPrimary,
          padding: density.phone ? theme.spacing.md : theme.spacing.xl,
          gap: theme.spacing.md,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ gap: 4, flex: 1 }}>
              <VadText variant="caption" tone="inverse">TRADE WHAT HAPPENS NEXT</VadText>
              <VadText variant={density.phone ? 'title' : 'title'} tone="inverse">Global events.{"\n"}Real markets.</VadText>
              <VadText variant="caption" tone="inverse">From finance to sports, Nigeria and beyond.</VadText>
            </View>
            <View style={{
              width: density.phone ? 76 : 112,
              height: density.phone ? 76 : 112,
              borderRadius: 100,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.13)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.22)',
            }}>
              <VadIcon name="markets" size={density.phone ? 36 : 48} tone="inverse" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <TourTarget id="home-explore-markets">
              <VadButton label="Explore markets" variant="secondary" size="small" fullWidth={false} onPress={() => onExploreMarkets()} trailing={<VadIcon name="chevronRight" size={14} tone="primary" />} />
            </TourTarget>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <VadText variant="caption" tone="inverse">{active.length} live</VadText>
              <VadText variant="caption" tone="inverse">{traded} traded · {trendingRail.length} moving</VadText>
            </View>
          </View>
        </View>
      </TourTarget>

      <HomePromotionCarousel promotions={promotions} onOpen={onOpenPromotion} />

      <TourTarget id="home-categories">
        <View style={{ gap: 8 }}>
          <VadSectionHeader title="Explore a theme" subtitle="Find markets by topic." actionLabel="All markets" onAction={() => onExploreMarkets()} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: theme.spacing.md }}>
            <ThemeChip label="All markets" selected onPress={() => onExploreMarkets()} />
            {categories.map((category) => (
              <ThemeChip key={category} label={category} onPress={() => onExploreMarkets(category)} />
            ))}
          </ScrollView>
        </View>
      </TourTarget>

      <TourTarget id="home-featured-markets">
        <View style={{ gap: theme.spacing.sm }}>
          <VadSectionHeader title="Trending markets" subtitle="The most active markets right now." actionLabel="See all" onAction={() => onExploreMarkets()} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <LensButton label="Live" selected={lens === 'LIVE'} onPress={() => setLens('LIVE')} />
            <LensButton label="VAD Select" selected={lens === 'VAD'} onPress={() => setLens('VAD')} />
            <TourTarget id="home-trending">
              <LensButton label="Momentum" selected={lens === 'MOMENTUM'} onPress={() => setLens('MOMENTUM')} />
            </TourTarget>
          </View>

          {lensMarkets.length ? (
            <View style={{ gap: theme.spacing.sm }}>
              {lensMarkets.slice(0, density.desktop ? 8 : 6).map((market) => (
                <View key={`${lens}-${market.instrument_public_id}`}>
                  <MarketCard market={market} onPress={() => onOpenMarket(market)} />
                </View>
              ))}
            </View>
          ) : (
            <VadCard variant="muted" style={{ minHeight: 104, justifyContent: 'center', gap: 5, padding: theme.spacing.md }}>
              <VadText variant="bodyStrong">
                {lens === 'MOMENTUM' ? 'Momentum is quiet right now.' : lens === 'VAD' ? 'No VAD selections are live right now.' : 'No live markets right now.'}
              </VadText>
              <VadText variant="caption" tone="secondary">Switch views or open the full market catalogue.</VadText>
              <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                <VadButton label="Browse all markets" variant="secondary" size="small" fullWidth={false} onPress={() => onExploreMarkets()} />
              </View>
            </VadCard>
          )}
        </View>
      </TourTarget>

      <TourTarget id="home-community">
        <VadProgressiveSection title="Market insights" icon="activity">
          {featuredSettings.enabled && featuredRail.length ? (
            <View style={{ gap: theme.spacing.sm }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: theme.spacing.sm }}>
                {featuredRail.slice(0, 4).map(({ market }) => (
                  <SignalCard key={market.instrument_public_id} market={market} detail={`${formatAssetCompact(market.total_volume, market.asset_code)} activity`} onPress={() => onOpenMarket(market)} />
                ))}
              </ScrollView>
            </View>
          ) : null}
          <View style={{ gap: theme.spacing.sm }}>
            <VadSectionHeader title="Community" actionLabel="Open feed" onAction={onOpenCommunity} />
            <SocialConvictionFeed markets={markets} canCreatePost={false} showComposer={false} maxPosts={1} onOpenMarket={onOpenMarket} />
          </View>
        </VadProgressiveSection>
      </TourTarget>
    </View>
  );
}

function FocusMarket({ market, detail, now, onPress }: { market: MarketCatalogItem; detail: string; now: number; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const timing = getMarketTiming(market, now);
  const yes = probability(market.yes_price);
  const no = probability(market.no_price);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${market.title}. YES ${yes}. NO ${no}. ${timing.statusLabel}.`}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: theme.radius.md,
        borderWidth: 0,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        padding: 0,
        gap: theme.spacing.xs,
        opacity: pressed ? 0.82 : 1,
        transform: [{ scale: pressed ? 0.992 : 1 }],
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <VadChip label={timing.statusLabel.toUpperCase()} tone={timing.tradingOpen ? 'yes' : timing.stage === 'SETTLEMENT_PENDING' ? 'brand' : 'neutral'} />
      </View>

      <VadText variant={density.phone ? 'heading' : 'title'} numberOfLines={2}>{market.title}</VadText>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{detail}</VadText>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <ProbabilityTile label="YES" value={yes} positive />
        <ProbabilityTile label="NO" value={no} positive={false} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <VadText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>{timing.primaryTiming}</VadText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <VadText variant="caption" tone="brand">{timing.tradingOpen ? 'Trade' : 'Details'}</VadText>
          <VadIcon name="chevronRight" size={14} tone="brand" />
        </View>
      </View>
    </Pressable>
  );
}

function ProbabilityTile({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: positive ? theme.colors.yes : theme.colors.no,
        backgroundColor: positive ? theme.colors.yesSoft : theme.colors.noSoft,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 6,
        gap: 2,
      }}
    >
      <VadText variant="caption" tone={positive ? 'yes' : 'no'}>{label}</VadText>
      <VadText variant="heading" tone={positive ? 'yes' : 'no'}>{value}</VadText>
    </View>
  );
}

function LensButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 42,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: selected ? theme.colors.brandSoft : pressed ? theme.colors.surfaceRaised : theme.colors.surface,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <VadText variant="caption" tone={selected ? 'brand' : 'secondary'}>{label}</VadText>
    </Pressable>
  );
}

function ThemeChip({ label, selected = false, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 42,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <VadText variant="caption" tone={selected ? 'brand' : 'secondary'}>{label}</VadText>
    </Pressable>
  );
}

function SignalCard({ market, detail, onPress }: { market: MarketCatalogItem; detail: string; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: density.desktop ? 280 : Math.min(Math.max(density.width * 0.72, 232), 272),
        minHeight: 116,
        borderRadius: theme.radius.xl,
        borderWidth: 1,
        borderColor: pressed ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.md,
        gap: 6,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <VadText variant="bodyStrong" numberOfLines={2}>{market.title}</VadText>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{detail}</VadText>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <VadChip label={market.asset_code} />
        <VadText variant="caption" tone="brand">Open →</VadText>
      </View>
    </Pressable>
  );
}

function formatAssetCompact(value: number | string | null | undefined, assetCode: string) {
  const amount = Number(value) || 0;
  const prefix = assetCode === 'NGN' ? '₦' : `${assetCode} `;
  if (amount >= 1_000_000_000) return `${prefix}${(amount / 1_000_000_000).toFixed(amount >= 10_000_000_000 ? 0 : 1)}B`;
  if (amount >= 1_000_000) return `${prefix}${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}M`;
  if (amount >= 1_000) return `${prefix}${(amount / 1_000).toFixed(amount >= 10_000 ? 0 : 1)}K`;
  return `${prefix}${Math.round(amount).toLocaleString(assetCode === 'NGN' ? 'en-NG' : 'en-US')}`;
}

function formatAcceleration(value: number) {
  const speed = Number(value) || 0;
  return `${Math.max(speed, 1).toFixed(speed >= 10 ? 0 : 1)}× faster`;
}
