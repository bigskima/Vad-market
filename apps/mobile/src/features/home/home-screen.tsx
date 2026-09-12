import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadText } from '@/components/ui/vad-text';
import { HomePromotionCarousel } from '@/features/home/components/home-promotion-carousel';
import { MarketCard } from '@/features/markets/components/market-card';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { TourTarget, useProductTour } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { FeaturedMarketRow, FeaturedMarketSettings, HomePromotion, TrendingMarketRow, TrendingMarketSettings, VadMarketRow } from '@/services/home-content-api';
import type { MarketCatalogItem } from '@/services/market-api';

export function HomeScreen({ markets, promotions, vadMarkets, featuredMarkets, trendingMarkets, featuredSettings, trendingSettings, onOpenMarket, onOpenPromotion, onExploreMarkets, onOpenCommunity }: {
  markets: MarketCatalogItem[]; promotions: HomePromotion[]; vadMarkets: VadMarketRow[]; featuredMarkets: FeaturedMarketRow[]; trendingMarkets: TrendingMarketRow[]; featuredSettings: FeaturedMarketSettings; trendingSettings: TrendingMarketSettings; onOpenMarket: (market: MarketCatalogItem) => void; onOpenPromotion: (targetPath: string) => void; onExploreMarkets: (category?: string) => void; onOpenCommunity: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { registerTarget } = useProductTour();
  const active = markets.filter((market) => market.status === 'OPEN' || market.status === 'ACTIVE');
  const categories = [...new Set(markets.map((market) => market.category).filter(Boolean))].slice(0, 8) as string[];
  const traded = markets.filter((market) => Boolean(market.last_trade_at)).length;
  const vadRail = vadMarkets.map((entry) => ({ entry, market: markets.find((market) => market.instrument_public_id === entry.instrument_public_id) })).filter((row): row is { entry: VadMarketRow; market: MarketCatalogItem } => Boolean(row.market));
  const featuredRail = featuredMarkets.map((entry) => ({ entry, market: markets.find((market) => market.instrument_public_id === entry.instrument_public_id) })).filter((row): row is { entry: FeaturedMarketRow; market: MarketCatalogItem } => Boolean(row.market));
  const trendingRail = trendingMarkets.map((entry) => ({ entry, market: markets.find((market) => market.instrument_public_id === entry.instrument_public_id) })).filter((row): row is { entry: TrendingMarketRow; market: MarketCatalogItem } => Boolean(row.market));
  const sectionGap = density.compact ? theme.spacing.md : theme.spacing.lg;

  return <View style={{ gap: sectionGap }}>
    <TourTarget id="home-overview">
      <VadCard variant="brand" style={{ padding: density.phone ? theme.spacing.md : theme.spacing.lg, gap: theme.spacing.md, borderColor: theme.colors.brandPrimary, overflow: 'hidden' }}>
        <View pointerEvents="none" style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -70, top: -80, backgroundColor: theme.colors.brandSoft }} />
        <View style={{ gap: 3 }}><VadText variant="caption" tone="brand">VAD MARKET PULSE</VadText><VadText variant={density.phone ? 'title' : 'heading'}>What’s moving today?</VadText><VadText variant="caption" tone="secondary">Live markets, recent activity and momentum at a glance.</VadText></View>
        <View style={{ flexDirection: 'row', gap: 8 }}><Metric value={`${active.length}`} label="Live markets" /><Metric value={`${traded}`} label="Recently traded" /><Metric value={`${trendingRail.length}`} label="Trending" /></View>
        <Pressable ref={(node) => registerTarget('home-explore-markets', node)} collapsable={false} accessibilityRole="button" onPress={() => onExploreMarkets()} style={({ pressed }) => ({ minHeight: 42, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandPrimary, opacity: pressed ? 0.78 : 1 })}><VadText variant="label" tone="inverse">Explore markets →</VadText></Pressable>
      </VadCard>
    </TourTarget>

    <HomePromotionCarousel promotions={promotions} onOpen={onOpenPromotion} />

    <TourTarget id="home-featured-markets"><View style={{ gap: sectionGap }}>
      <MarketRailSection title="VAD Markets" subtitle="Published and selected by VAD." emptyTitle="No VAD Markets are live right now." emptyBody="Newly published VAD Markets will appear here." onSeeAll={() => onExploreMarkets()}>{vadRail.map(({ market }) => <MarketRailCard key={market.instrument_public_id} market={market} badge="VAD MARKET" badgeTone="brand" onPress={() => onOpenMarket(market)} />)}</MarketRailSection>
      {featuredSettings.enabled ? <MarketRailSection title="Worth Watching" subtitle={`Strongest completed activity over ${formatWindow(featuredSettings.windowHours)}.`} emptyTitle="No Featured Market yet." emptyBody="Markets appear here automatically after reaching the current activity requirement." onSeeAll={() => onExploreMarkets()}>{featuredRail.map(({ market, entry }) => <MarketRailCard key={market.instrument_public_id} market={market} badge={`#${entry.rank} FEATURED`} badgeTone="yes" detail={`${formatNairaCompact(entry.volume_ngn)} activity`} onPress={() => onOpenMarket(market)} />)}</MarketRailSection> : null}
      {trendingSettings.enabled ? <TourTarget id="home-trending"><MarketRailSection title="Trending Now" subtitle={`Momentum over ${formatMinutes(trendingSettings.windowMinutes)}.`} emptyTitle="Nothing is trending right now." emptyBody="Markets appear here when genuine completed trading begins accelerating." onSeeAll={() => onExploreMarkets()}>{trendingRail.map(({ market, entry }) => <MarketRailCard key={market.instrument_public_id} market={market} badge={`#${entry.rank} TRENDING`} badgeTone="warning" detail={`${formatAcceleration(Math.max(entry.volume_acceleration, entry.trade_acceleration))} · ${entry.unique_traders} traders`} onPress={() => onOpenMarket(market)} />)}</MarketRailSection></TourTarget> : null}
    </View></TourTarget>

    <TourTarget id="home-categories"><View style={{ gap: 7 }}><VadSectionHeader title="Explore Categories" subtitle="Find markets by what you follow." actionLabel="All markets" onAction={() => onExploreMarkets()} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: theme.spacing.md }}><VadChip label="All markets" selected tone="brand" onPress={() => onExploreMarkets()} />{categories.map((category) => <VadChip key={category} label={category} onPress={() => onExploreMarkets(category)} />)}</ScrollView></View></TourTarget>

    <TourTarget id="home-community"><View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}><VadSectionHeader title="Community Pulse" subtitle="A quick look at what people are saying." actionLabel="Open feed" onAction={onOpenCommunity} /><SocialConvictionFeed markets={markets} canCreatePost={false} showComposer={false} maxPosts={density.phone ? 2 : 3} onOpenMarket={onOpenMarket} /></View></TourTarget>
  </View>;
}

function Metric({ value, label }: { value: string; label: string }) { const theme = useVadTheme(); return <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 9, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}><VadText variant="bodyStrong">{value}</VadText><VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText></View>; }

function MarketRailSection({ title, subtitle, emptyTitle, emptyBody, onSeeAll, children }: { title: string; subtitle: string; emptyTitle: string; emptyBody: string; onSeeAll: () => void; children: ReactNode }) { const theme = useVadTheme(); const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children); return <View style={{ gap: 7 }}><VadSectionHeader title={title} subtitle={subtitle} actionLabel="See all" onAction={onSeeAll} />{hasChildren ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: theme.spacing.md }}>{children}</ScrollView> : <View style={{ minHeight: 72, justifyContent: 'center', gap: 2, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, paddingHorizontal: theme.spacing.md, paddingVertical: 10, backgroundColor: theme.colors.surface }}><VadText variant="bodyStrong">{emptyTitle}</VadText><VadText variant="caption" tone="secondary">{emptyBody}</VadText></View>}</View>; }

function MarketRailCard({ market, badge, badgeTone, detail, onPress }: { market: MarketCatalogItem; badge: string; badgeTone: 'brand' | 'yes' | 'warning'; detail?: string; onPress: () => void }) { const density = useProductDensity(); return <View style={{ width: density.desktop ? 292 : Math.min(Math.max(density.width * 0.78, 248), 286), gap: 6 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 25 }}><VadChip label={badge} tone={badgeTone} />{detail ? <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>{detail}</VadText> : null}</View><MarketCard market={market} compact onPress={onPress} /></View>; }
function formatNairaCompact(value: number) { const amount = Number(value) || 0; if (amount >= 1_000_000_000) return `₦${(amount / 1_000_000_000).toFixed(amount >= 10_000_000_000 ? 0 : 1)}B`; if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}M`; if (amount >= 1_000) return `₦${(amount / 1_000).toFixed(amount >= 10_000 ? 0 : 1)}K`; return `₦${Math.round(amount).toLocaleString('en-NG')}`; }
function formatWindow(hours: number) { if (hours === 24) return '24 hours'; if (hours % 24 === 0) return `${hours / 24} days`; return `${hours} hours`; }
function formatMinutes(minutes: number) { if (minutes < 60) return `${minutes} minutes`; if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`; return `${minutes} minutes`; }
function formatAcceleration(value: number) { const speed = Number(value) || 0; return `${Math.max(speed, 1).toFixed(speed >= 10 ? 0 : 1)}× faster`; }
