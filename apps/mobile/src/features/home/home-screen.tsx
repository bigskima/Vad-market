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

  const lensMarkets = lens === 'VAD'
    ? vadRail.map((row) => row.market)
    : lens === 'MOMENTUM'
      ? trendingSettings.enabled ? trendingRail.map((row) => row.market) : []
      : active;

  const boardSubtitle = lens === 'LIVE'
    ? 'Open markets you can evaluate now.'
    : lens === 'VAD'
      ? 'Markets published or selected by VAD.'
      : `Markets accelerating over ${formatMinutes(trendingSettings.windowMinutes)}.`;

  const sectionGap = density.compact ? theme.spacing.md : theme.spacing.lg;

  return (
    <View style={{ gap: sectionGap }}>
      <TourTarget id="home-overview">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Explore global events and markets"
          onPress={() => onExploreMarkets()}
          style={({ pressed }) => ({
            minHeight: density.phone ? 202 : 228,
            padding: density.phone ? 20 : 26,
            borderRadius: 24,
            overflow: 'hidden',
            justifyContent: 'space-between',
            backgroundColor: theme.mode === 'dark' ? '#30259C' : '#3927B8',
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: density.phone ? 186 : 240,
              height: density.phone ? 186 : 240,
              borderRadius: 120,
              right: density.phone ? -42 : -24,
              top: density.phone ? 12 : -6,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.22)',
              backgroundColor: 'rgba(126,108,255,0.22)',
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: density.phone ? 142 : 184,
              height: density.phone ? 142 : 184,
              borderRadius: 100,
              right: density.phone ? -20 : 8,
              top: density.phone ? 34 : 22,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.15)',
              backgroundColor: 'rgba(20,17,95,0.25)',
            }}
          />
          <View style={{ gap: 8, maxWidth: density.phone ? '82%' : '72%' }}>
            <VadText variant="caption" style={{ color: '#D8D3FF', letterSpacing: 1 }}>TRADE WHAT HAPPENS NEXT</VadText>
            <VadText variant={density.phone ? 'title' : 'title'} style={{ color: '#FFFFFF', fontSize: density.phone ? 29 : 34, lineHeight: density.phone ? 34 : 40 }} numberOfLines={3}>
              Global events. Real markets.
            </VadText>
            <VadText variant="body" style={{ color: '#E5E2FF' }} numberOfLines={2}>
              From finance to sports, Nigeria and beyond.
            </VadText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <VadText variant="label" style={{ color: '#3927B8' }}>Explore markets</VadText>
              <VadIcon name="chevronRight" size={16} tone="brand" />
            </View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginRight: density.phone ? 0 : 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' }}>
                <VadText style={{ color: '#E99A24', fontSize: 18, fontWeight: '800' }}>₿</VadText>
              </View>
              <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' }}>
                <VadIcon name="activity" size={18} tone="brand" />
              </View>
            </View>
          </View>
        </Pressable>
      </TourTarget>

      <HomePromotionCarousel promotions={promotions} onOpen={onOpenPromotion} />

      <TourTarget id="home-featured-markets">
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <VadText variant="heading">Trending markets</VadText>
              <VadText variant="caption" tone="secondary" numberOfLines={2}>{boardSubtitle}</VadText>
            </View>
            <VadButton label="See all" variant="ghost" size="small" fullWidth={false} onPress={() => onExploreMarkets()} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingRight: theme.spacing.md }}>
            <ThemeChip label="For you" selected={lens === 'LIVE'} onPress={() => setLens('LIVE')} />
            <ThemeChip label="VAD Select" selected={lens === 'VAD'} onPress={() => setLens('VAD')} />
            <TourTarget id="home-trending">
              <ThemeChip label="Trending" selected={lens === 'MOMENTUM'} onPress={() => setLens('MOMENTUM')} />
            </TourTarget>
          </ScrollView>

          {lensMarkets.length ? (
            <View style={{ gap: theme.spacing.sm }}>
              {lensMarkets.slice(0, 6).map((market) => (
                <MarketCard key={`${lens}-${market.instrument_public_id}`} market={market} onPress={() => onOpenMarket(market)} />
              ))}
            </View>
          ) : (
            <VadCard variant="muted" style={{ minHeight: 88, justifyContent: 'center', gap: 4, borderRadius: theme.radius.xl }}>
              <VadText variant="bodyStrong">
                {lens === 'MOMENTUM' ? 'No strong momentum signals yet.' : lens === 'VAD' ? 'No VAD selections are live right now.' : 'No markets are live right now.'}
              </VadText>
              <VadText variant="caption" tone="secondary">Browse all markets to explore the full catalogue.</VadText>
              <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                <VadButton label="Browse markets" size="small" fullWidth={false} onPress={() => onExploreMarkets()} />
              </View>
            </VadCard>
          )}
        </View>
      </TourTarget>

      <TourTarget id="home-categories">
        <View style={{ gap: 8 }}>
          <VadSectionHeader
            title="Explore a theme"
            subtitle="Find markets by topic."
            actionLabel="All"
            onAction={() => onExploreMarkets()}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 7, paddingRight: theme.spacing.md }}
          >
            <ThemeChip label="All markets" selected onPress={() => onExploreMarkets()} />
            {categories.map((category) => (
              <ThemeChip key={category} label={category} onPress={() => onExploreMarkets(category)} />
            ))}
          </ScrollView>
        </View>
      </TourTarget>

      <TourTarget id="home-community">
        <VadProgressiveSection
          title="More market intelligence"
          eyebrow="DEPTH ON DEMAND"
          description="Explore market signals and community views."
          icon="activity"
          summary={<VadText variant="caption" tone="tertiary">{featuredSettings.enabled ? `${featuredRail.length} signals` : 'Signals'} · Community</VadText>}
        >
          {featuredSettings.enabled && featuredRail.length ? (
            <View style={{ gap: theme.spacing.sm }}>
              <View style={{ gap: 2 }}>
                <VadText variant="caption" tone="brand">CONVICTION SIGNALS</VadText>
                <VadText variant="caption" tone="secondary">Strong completed activity over {formatWindow(featuredSettings.windowHours)}.</VadText>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: theme.spacing.sm }}>
                {featuredRail.slice(0, 4).map(({ market, entry }) => (
                  <SignalCard
                    key={market.instrument_public_id}
                    market={market}
                    detail={`${formatAssetCompact(market.total_volume, market.asset_code)} activity`}
                    onPress={() => onOpenMarket(market)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={{ gap: theme.spacing.sm }}>
            <VadSectionHeader
              title="Community conviction"
              subtitle="What the community thinks."
              actionLabel="Open feed"
              onAction={onOpenCommunity}
            />
            <SocialConvictionFeed
              markets={markets}
              canCreatePost={false}
              showComposer={false}
              maxPosts={1}
              onOpenMarket={onOpenMarket}
            />
          </View>
        </VadProgressiveSection>
      </TourTarget>
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
      <VadText variant="caption" tone="brand">ACTIVITY SIGNAL</VadText>
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

function formatWindow(hours: number) {
  if (hours === 24) return '24 hours';
  if (hours % 24 === 0) return `${hours / 24} days`;
  return `${hours} hours`;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`;
  return `${minutes} minutes`;
}

function formatAcceleration(value: number) {
  const speed = Number(value) || 0;
  return `${Math.max(speed, 1).toFixed(speed >= 10 ? 0 : 1)}× faster`;
}
