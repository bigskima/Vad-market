import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadChip } from '@/components/ui/vad-chip';
import { VadCard } from '@/components/ui/vad-card';
import { VadProgressiveSection } from '@/components/ui/vad-progressive-section';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadText } from '@/components/ui/vad-text';
import { HomeHeroBanner } from '@/features/home/components/home-hero-banner';
import { HomePromotionCarousel } from '@/features/home/components/home-promotion-carousel';
import { MarketCard } from '@/features/markets/components/market-card';
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

  const vadRail = vadMarkets
    .map((entry) => ({ entry, market: markets.find((market) => market.instrument_public_id === entry.instrument_public_id) }))
    .filter((row): row is { entry: VadMarketRow; market: MarketCatalogItem } => Boolean(row.market));

  const featuredRail = featuredMarkets
    .map((entry) => ({ entry, market: markets.find((market) => market.instrument_public_id === entry.instrument_public_id) }))
    .filter((row): row is { entry: FeaturedMarketRow; market: MarketCatalogItem } => Boolean(row.market));

  const trendingRail = trendingMarkets
    .map((entry) => ({ entry, market: markets.find((market) => market.instrument_public_id === entry.instrument_public_id) }))
    .filter((row): row is { entry: TrendingMarketRow; market: MarketCatalogItem } => Boolean(row.market));

  const lensMarkets = lens === 'VAD'
    ? vadRail.map((row) => row.market)
    : lens === 'MOMENTUM'
      ? trendingSettings.enabled ? trendingRail.map((row) => row.market) : []
      : active;

  const sectionGap = density.compact ? theme.spacing.sm : theme.spacing.md;

  return (
    <View style={{ gap: sectionGap, width: '100%' }}>
      <TourTarget id="home-overview">
        <HomeHeroBanner onExplore={() => onExploreMarkets()} />
      </TourTarget>

      <TourTarget id="home-categories">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: theme.spacing.sm }}>
          <ThemeChip label="🔥 For you" selected={lens === 'LIVE'} onPress={() => setLens('LIVE')} />
          <ThemeChip label="↗ Trending" selected={lens === 'MOMENTUM'} onPress={() => setLens('MOMENTUM')} />
          <ThemeChip label="VAD Select" selected={lens === 'VAD'} onPress={() => setLens('VAD')} />
          {categories.map((category) => (
            <ThemeChip key={category} label={category} onPress={() => onExploreMarkets(category)} />
          ))}
        </ScrollView>
      </TourTarget>

      <TourTarget id="home-featured-markets">
        <View style={{ gap: theme.spacing.sm }}>
          <VadSectionHeader
            title={lens === 'VAD' ? 'VAD Select' : 'Trending markets'}
            subtitle={lens === 'VAD' ? 'Markets selected by VAD.' : lens === 'MOMENTUM' ? 'Markets gaining activity right now.' : 'The most active markets right now.'}
            actionLabel="See all"
            onAction={() => onExploreMarkets()}
          />

          {lensMarkets.length ? (
            <View style={{
              flexDirection: density.desktop ? 'row' : 'column',
              flexWrap: density.desktop ? 'wrap' : 'nowrap',
              alignItems: 'stretch',
              gap: theme.spacing.sm,
            }}>
              {lensMarkets.slice(0, density.desktop ? 8 : 6).map((market) => (
                <View key={`${lens}-${market.instrument_public_id}`} style={{ width: density.desktop ? '48%' : '100%', minWidth: 0 }}>
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

      {promotions.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSectionHeader title="Highlights" subtitle="Updates from across VAD." />
          <HomePromotionCarousel promotions={promotions} onOpen={onOpenPromotion} />
        </View>
      ) : null}

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

function ThemeChip({ label, selected = false, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 32,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
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
        width: density.desktop ? 252 : Math.min(Math.max(density.width * 0.68, 208), 248),
        minHeight: 96,
        borderRadius: theme.radius.xl,
        borderWidth: 1,
        borderColor: pressed ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.sm,
        gap: 4,
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
