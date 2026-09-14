import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadText } from '@/components/ui/vad-text';
import { HomePromotionCarousel } from '@/features/home/components/home-promotion-carousel';
import { MarketCard } from '@/features/markets/components/market-card';
import { MarketTimeStatus } from '@/features/markets/components/market-time-status';
import { probability } from '@/features/markets/format';
import { marketStatusMeta } from '@/features/markets/market-state';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { TourTarget, useProductTour } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
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
  const { registerTarget } = useProductTour();

  const active = markets.filter((market) => market.status === 'OPEN' || market.status === 'ACTIVE');
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
      ? `${formatNairaCompact(featuredRail[0].entry.volume_ngn)} completed activity`
      : leadMarket
        ? `${leadMarket.category ?? 'General'} · ${leadMarket.asset_code}`
        : '';

  const sectionGap = density.compact ? theme.spacing.md : theme.spacing.lg;

  return (
    <View style={{ gap: sectionGap }}>
      <TourTarget id="home-overview">
        <VadCard
          variant="brand"
          style={{
            padding: density.phone ? theme.spacing.lg : theme.spacing.xl,
            gap: density.phone ? theme.spacing.md : theme.spacing.lg,
            borderColor: theme.colors.brandPrimary,
            overflow: 'hidden',
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: density.phone ? 230 : 320,
              height: density.phone ? 230 : 320,
              borderRadius: density.phone ? 115 : 160,
              right: density.phone ? -116 : -128,
              top: density.phone ? -110 : -160,
              backgroundColor: theme.colors.surface,
              opacity: theme.mode === 'dark' ? 0.06 : 0.46,
            }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.md }}>
            <View style={{ flex: 1, minWidth: 0, gap: 5, maxWidth: 610 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.yes }} />
                <VadText variant="caption" tone="brand" style={{ letterSpacing: 1.15 }}>
                  VAD LIVE INTELLIGENCE
                </VadText>
              </View>
              <VadText variant={density.phone ? 'title' : 'display'}>
                Read the market. Form a conviction. Take a position.
              </VadText>
              <VadText variant="body" tone="secondary">
                Start with the strongest signal, then weigh probability, time-to-close, momentum and community context without information overload.
              </VadText>
            </View>
            {!density.phone ? <VadChip label={`${active.length} LIVE`} tone="yes" /> : null}
          </View>

          {leadMarket ? (
            <LeadMarket
              market={leadMarket}
              detail={leadDetail}
              onPress={() => onOpenMarket(leadMarket)}
            />
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Metric value={`${active.length}`} label="Live" tone="yes" />
            <Metric value={`${traded}`} label="Traded" />
            <Metric value={`${trendingRail.length}`} label="Momentum" tone="brand" />
          </View>

          <View style={{ flexDirection: density.phone ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton
              label="Explore all markets"
              fullWidth={density.phone}
              onPress={() => onExploreMarkets()}
              leading={<VadIcon name="markets" size={17} tone="inverse" />}
              style={density.phone ? undefined : { alignSelf: 'flex-start' }}
            />
            <Pressable
              ref={(node) => registerTarget('home-explore-markets', node)}
              collapsable={false}
              accessibilityRole="button"
              onPress={onOpenCommunity}
              style={({ pressed }) => ({
                minHeight: 44,
                alignSelf: density.phone ? 'stretch' : 'flex-start',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 7,
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.borderStrong,
                backgroundColor: theme.colors.surface,
                opacity: pressed ? 0.76 : 1,
              })}
            >
              <VadIcon name="community" size={16} tone="brand" />
              <VadText variant="label" tone="primary">Community pulse</VadText>
            </Pressable>
          </View>
        </VadCard>
      </TourTarget>

      <HomePromotionCarousel promotions={promotions} onOpen={onOpenPromotion} />

      <TourTarget id="home-featured-markets">
        <View style={{ gap: sectionGap }}>
          <MarketRailSection
            title="Live board"
            subtitle="A fast scan of open markets, with conviction and closing urgency visible before you tap."
            emptyTitle="No live markets right now."
            emptyBody="New live markets will appear here when they open."
            onSeeAll={() => onExploreMarkets()}
          >
            {active.slice(0, 6).map((market) => (
              <MarketRailCard
                key={market.instrument_public_id}
                market={market}
                badge="LIVE"
                badgeTone="yes"
                onPress={() => onOpenMarket(market)}
              />
            ))}
          </MarketRailSection>

          {vadRail.length ? (
            <MarketRailSection
              title="VAD Select"
              subtitle="Markets published or selected by VAD."
              emptyTitle="No VAD selections are live right now."
              emptyBody="New selections will appear here."
              onSeeAll={() => onExploreMarkets()}
            >
              {vadRail.slice(0, 6).map(({ market }) => (
                <MarketRailCard
                  key={market.instrument_public_id}
                  market={market}
                  badge="VAD SELECT"
                  badgeTone="brand"
                  onPress={() => onOpenMarket(market)}
                />
              ))}
            </MarketRailSection>
          ) : null}

          {featuredSettings.enabled ? (
            <MarketRailSection
              title="Conviction signals"
              subtitle={`Strong completed activity over ${formatWindow(featuredSettings.windowHours)}.`}
              emptyTitle="No strong conviction signal yet."
              emptyBody="Markets appear here after reaching the current activity threshold."
              onSeeAll={() => onExploreMarkets()}
            >
              {featuredRail.slice(0, 6).map(({ market, entry }) => (
                <MarketRailCard
                  key={market.instrument_public_id}
                  market={market}
                  badge={`#${entry.rank} ACTIVE`}
                  badgeTone="brand"
                  detail={`${formatNairaCompact(entry.volume_ngn)} activity`}
                  onPress={() => onOpenMarket(market)}
                />
              ))}
            </MarketRailSection>
          ) : null}

          {trendingSettings.enabled ? (
            <TourTarget id="home-trending">
              <MarketRailSection
                title="Momentum"
                subtitle={`Markets accelerating over ${formatMinutes(trendingSettings.windowMinutes)}.`}
                emptyTitle="Momentum is quiet right now."
                emptyBody="This layer fills when genuine completed trading begins accelerating."
                onSeeAll={() => onExploreMarkets()}
              >
                {trendingRail.slice(0, 6).map(({ market, entry }) => (
                  <MarketRailCard
                    key={market.instrument_public_id}
                    market={market}
                    badge={`#${entry.rank} TRENDING`}
                    badgeTone="warning"
                    detail={`${formatAcceleration(Math.max(entry.volume_acceleration, entry.trade_acceleration))} · ${entry.unique_traders} traders`}
                    onPress={() => onOpenMarket(market)}
                  />
                ))}
              </MarketRailSection>
            </TourTarget>
          ) : null}
        </View>
      </TourTarget>

      <TourTarget id="home-categories">
        <View style={{ gap: theme.spacing.sm }}>
          <VadSectionHeader
            title="Explore by theme"
            subtitle="Jump into the questions you already care about."
            actionLabel="All markets"
            onAction={() => onExploreMarkets()}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: theme.spacing.md }}
          >
            <CategoryTile label="All markets" symbol="◎" selected onPress={() => onExploreMarkets()} />
            {categories.map((category) => (
              <CategoryTile
                key={category}
                label={category}
                symbol={category.slice(0, 1).toUpperCase()}
                onPress={() => onExploreMarkets(category)}
              />
            ))}
          </ScrollView>
        </View>
      </TourTarget>

      <TourTarget id="home-community">
        <View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
          <VadSectionHeader
            title="Community conviction"
            subtitle="A small sample of the thinking around the market—not a replacement for market rules."
            actionLabel="Open feed"
            onAction={onOpenCommunity}
          />
          <SocialConvictionFeed
            markets={markets}
            canCreatePost={false}
            showComposer={false}
            maxPosts={density.phone ? 2 : 3}
            onOpenMarket={onOpenMarket}
          />
        </View>
      </TourTarget>
    </View>
  );
}

function Metric({ value, label, tone = 'primary' }: { value: string; label: string; tone?: 'primary' | 'yes' | 'brand' }) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        gap: 2,
      }}
    >
      <VadText variant="heading" tone={tone}>{value}</VadText>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
    </View>
  );
}

function LeadMarket({ market, detail, onPress }: { market: MarketCatalogItem; detail: string; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const status = marketStatusMeta(market.status);
  const yes = probability(market.yes_price);
  const no = probability(market.no_price);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${market.title}. YES ${yes}. NO ${no}. ${status.label}.`}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: theme.radius.xl,
        borderWidth: 1,
        borderColor: pressed ? theme.colors.borderStrong : theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: density.phone ? theme.spacing.md : theme.spacing.lg,
        gap: theme.spacing.sm,
        opacity: pressed ? 0.82 : 1,
        transform: [{ scale: pressed ? 0.992 : 1 }],
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <VadChip label="MARKET IN FOCUS" tone={status.tradeOpen ? 'warning' : 'brand'} />
        <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
          {detail}
        </VadText>
      </View>
      <VadText variant={density.phone ? 'bodyStrong' : 'heading'} numberOfLines={3}>{market.title}</VadText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <ProbabilityTile label="YES" value={yes} positive />
        <ProbabilityTile label="NO" value={no} positive={false} />
      </View>
      <MarketTimeStatus market={market} compact fill />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <VadText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
          {status.detail}
        </VadText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <VadText variant="caption" tone="brand">{status.tradeOpen ? 'Trade market' : 'View details'}</VadText>
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
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 9,
        backgroundColor: positive ? theme.colors.yesSoft : theme.colors.noSoft,
        borderWidth: 1,
        borderColor: positive ? theme.colors.yes : theme.colors.no,
        gap: 1,
      }}
    >
      <VadText variant="caption" tone={positive ? 'yes' : 'no'}>{label}</VadText>
      <VadText variant="heading" tone={positive ? 'yes' : 'no'}>{value}</VadText>
    </View>
  );
}

function MarketRailSection({
  title,
  subtitle,
  emptyTitle,
  emptyBody,
  onSeeAll,
  children,
}: {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyBody: string;
  onSeeAll: () => void;
  children: ReactNode;
}) {
  const theme = useVadTheme();
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <View style={{ gap: 8 }}>
      <VadSectionHeader title={title} subtitle={subtitle} actionLabel="See all" onAction={onSeeAll} />
      {hasChildren ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingRight: theme.spacing.md }}
          decelerationRate="fast"
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={{
            minHeight: 72,
            justifyContent: 'center',
            gap: 2,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: 10,
            backgroundColor: theme.colors.surface,
          }}
        >
          <VadText variant="bodyStrong">{emptyTitle}</VadText>
          <VadText variant="caption" tone="secondary">{emptyBody}</VadText>
        </View>
      )}
    </View>
  );
}

function MarketRailCard({
  market,
  badge,
  badgeTone,
  detail,
  onPress,
}: {
  market: MarketCatalogItem;
  badge: string;
  badgeTone: 'brand' | 'yes' | 'warning';
  detail?: string;
  onPress: () => void;
}) {
  const density = useProductDensity();

  return (
    <View
      style={{
        width: density.desktop ? 300 : Math.min(Math.max(density.width * 0.8, 252), 292),
        gap: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 25 }}>
        <VadChip label={badge} tone={badgeTone} />
        {detail ? (
          <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
            {detail}
          </VadText>
        ) : null}
      </View>
      <MarketCard market={market} compact onPress={onPress} />
    </View>
  );
}

function CategoryTile({ label, symbol, selected = false, onPress }: {
  label: string;
  symbol: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Explore ${label}`}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 112,
        minHeight: 88,
        justifyContent: 'space-between',
        borderRadius: theme.radius.xl,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
        padding: 11,
        opacity: pressed ? 0.78 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? theme.colors.brandPrimary : theme.colors.surfaceMuted,
        }}
      >
        <VadText variant="caption" tone={selected ? 'inverse' : 'brand'}>{symbol}</VadText>
      </View>
      <VadText variant="caption" tone={selected ? 'brand' : 'secondary'} numberOfLines={2}>
        {label}
      </VadText>
    </Pressable>
  );
}

function formatNairaCompact(value: number) {
  const amount = Number(value) || 0;
  if (amount >= 1_000_000_000) return `₦${(amount / 1_000_000_000).toFixed(amount >= 10_000_000_000 ? 0 : 1)}B`;
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}M`;
  if (amount >= 1_000) return `₦${(amount / 1_000).toFixed(amount >= 10_000 ? 0 : 1)}K`;
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
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
