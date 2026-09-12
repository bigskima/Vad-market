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
import type {
  FeaturedMarketRow,
  FeaturedMarketSettings,
  HomePromotion,
  VadMarketRow,
} from '@/services/home-content-api';
import type { MarketCatalogItem } from '@/services/market-api';

export function HomeScreen({
  markets,
  promotions,
  vadMarkets,
  featuredMarkets,
  featuredSettings,
  onOpenMarket,
  onOpenPromotion,
  onExploreMarkets,
  onOpenCommunity,
}: {
  markets: MarketCatalogItem[];
  promotions: HomePromotion[];
  vadMarkets: VadMarketRow[];
  featuredMarkets: FeaturedMarketRow[];
  featuredSettings: FeaturedMarketSettings;
  onOpenMarket: (market: MarketCatalogItem) => void;
  onOpenPromotion: (targetPath: string) => void;
  onExploreMarkets: (category?: string) => void;
  onOpenCommunity: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { registerTarget } = useProductTour();
  const desktopMarketGrid = density.desktop;

  const active = markets.filter(
    (market) => market.status === 'OPEN' || market.status === 'ACTIVE',
  );
  const categories = [
    ...new Set(markets.map((market) => market.category).filter(Boolean)),
  ].slice(0, 8) as string[];

  const vadRail = vadMarkets
    .map((entry) => ({
      entry,
      market: markets.find(
        (market) => market.instrument_public_id === entry.instrument_public_id,
      ),
    }))
    .filter(
      (row): row is { entry: VadMarketRow; market: MarketCatalogItem } => Boolean(row.market),
    );

  const featuredRail = featuredMarkets
    .map((entry) => ({
      entry,
      market: markets.find(
        (market) => market.instrument_public_id === entry.instrument_public_id,
      ),
    }))
    .filter(
      (row): row is { entry: FeaturedMarketRow; market: MarketCatalogItem } => Boolean(row.market),
    );

  const highlightedIds = new Set([
    ...vadRail.map(({ market }) => market.instrument_public_id),
    ...featuredRail.map(({ market }) => market.instrument_public_id),
  ]);
  const trending = [...markets]
    .sort(
      (a, b) =>
        Number(Boolean(b.last_trade_at)) - Number(Boolean(a.last_trade_at)) ||
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .filter((market) => !highlightedIds.has(market.instrument_public_id))
    .slice(0, 5);
  const sectionGap = density.compact ? theme.spacing.lg : theme.spacing.xl;
  const traded = markets.filter((market) => Boolean(market.last_trade_at)).length;

  return (
    <View style={{ gap: sectionGap }}>
      <TourTarget id="home-overview">
        <VadCard
          variant="brand"
          style={{
            gap: density.compact ? theme.spacing.md : theme.spacing.lg,
            padding: density.phone ? theme.spacing.lg : theme.spacing.xl,
            borderColor: theme.colors.brandPrimary,
          }}
        >
          <View style={{ gap: density.compact ? 6 : theme.spacing.sm }}>
            <VadText variant="caption" tone="brand">VAD MARKET</VadText>
            <VadText variant={density.phone ? 'title' : 'display'}>
              Price the outcome. Back your conviction.
            </VadText>
            <VadText tone="secondary" style={{ maxWidth: 650 }}>
              Discover markets, compare current prices and take a position when you are ready.
            </VadText>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: density.compact ? 6 : theme.spacing.xs }}>
            <VadChip label={`${active.length} live`} tone="yes" />
            <VadChip label={`${categories.length} categories`} />
            <VadChip label={`${traded} recently traded`} />
          </View>

          <Pressable
            ref={(node) => registerTarget('home-explore-markets', node)}
            collapsable={false}
            accessibilityRole="button"
            onPress={() => onExploreMarkets()}
            style={({ pressed }) => ({
              minHeight: 44,
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.lg,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.brandPrimary,
              opacity: pressed ? 0.78 : 1,
            })}
          >
            <VadText variant="label" tone="inverse">Explore markets →</VadText>
          </Pressable>
        </VadCard>
      </TourTarget>

      <HomePromotionCarousel promotions={promotions} onOpen={onOpenPromotion} />

      <TourTarget id="home-featured-markets">
        <View style={{ gap: sectionGap }}>
          <View style={{ gap: density.compact ? 8 : theme.spacing.sm }}>
            <VadSectionHeader
              title="VAD Markets"
              subtitle="Markets published and selected by VAD."
              actionLabel="All markets"
              onAction={() => onExploreMarkets()}
            />
            {vadRail.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.md }}
              >
                {vadRail.map(({ market }) => (
                  <MarketRailCard
                    key={market.instrument_public_id}
                    market={market}
                    badge="VAD MARKET"
                    badgeTone="brand"
                    onPress={() => onOpenMarket(market)}
                  />
                ))}
              </ScrollView>
            ) : (
              <VadCard variant="outlined" style={{ minHeight: 82, justifyContent: 'center', gap: 3 }}>
                <VadText variant="bodyStrong">No VAD Markets are live right now.</VadText>
                <VadText variant="caption" tone="secondary">
                  Newly published VAD Markets will appear here.
                </VadText>
              </VadCard>
            )}
          </View>

          {featuredRail.length ? (
            <View style={{ gap: density.compact ? 8 : theme.spacing.sm }}>
              <VadSectionHeader
                title="Featured Markets"
                subtitle={`Most active markets over the last ${formatWindow(featuredSettings.windowHours)}.`}
                actionLabel="All markets"
                onAction={() => onExploreMarkets()}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.md }}
              >
                {featuredRail.map(({ market, entry }) => (
                  <MarketRailCard
                    key={market.instrument_public_id}
                    market={market}
                    badge={`#${entry.rank} FEATURED`}
                    badgeTone="yes"
                    detail={`${formatNairaCompact(entry.volume_ngn)} recent activity`}
                    onPress={() => onOpenMarket(market)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </TourTarget>

      <TourTarget id="home-categories">
        <View style={{ gap: density.compact ? 8 : theme.spacing.sm }}>
          <VadSectionHeader
            title="Explore"
            subtitle="Jump straight into a category."
            actionLabel="All markets"
            onAction={() => onExploreMarkets()}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: density.compact ? 6 : theme.spacing.xs, paddingRight: theme.spacing.md }}
          >
            <VadChip label="All markets" selected tone="brand" onPress={() => onExploreMarkets()} />
            {categories.map((category) => (
              <VadChip key={category} label={category} onPress={() => onExploreMarkets(category)} />
            ))}
          </ScrollView>
        </View>
      </TourTarget>

      <TourTarget id="home-trending">
        <View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
          <VadSectionHeader
            title="Trending now"
            subtitle="More markets with recent activity."
            actionLabel="See all"
            onAction={() => onExploreMarkets()}
          />
          {trending.length ? (
            desktopMarketGrid ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, alignItems: 'stretch' }}>
                {trending.map((market) => (
                  <View key={market.instrument_public_id} style={{ flexGrow: 1, flexBasis: 320, minWidth: 0 }}>
                    <MarketCard market={market} onPress={() => onOpenMarket(market)} />
                  </View>
                ))}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.md }}
              >
                {trending.map((market) => (
                  <View key={market.instrument_public_id} style={{ width: Math.min(density.width - (density.narrow ? 36 : 44), 316) }}>
                    <MarketCard market={market} onPress={() => onOpenMarket(market)} />
                  </View>
                ))}
              </ScrollView>
            )
          ) : (
            <VadCard variant="outlined" style={{ minHeight: 78, justifyContent: 'center' }}>
              <VadText variant="caption" tone="tertiary">
                Recent trading activity will appear here when available.
              </VadText>
            </VadCard>
          )}
        </View>
      </TourTarget>

      <TourTarget id="home-community">
        <View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
          <VadSectionHeader
            title="Community"
            subtitle="See what other people are saying about the markets."
            actionLabel="Open feed"
            onAction={onOpenCommunity}
          />
          <SocialConvictionFeed
            markets={markets}
            canCreatePost={false}
            showComposer={false}
            maxPosts={3}
            onOpenMarket={onOpenMarket}
          />
        </View>
      </TourTarget>
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
  badgeTone: 'brand' | 'yes';
  detail?: string;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <View
      style={{
        width: Math.min(density.width - (density.narrow ? 36 : 44), density.desktop ? 340 : 316),
        gap: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 }}>
        <VadChip label={badge} tone={badgeTone} />
        {detail ? (
          <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
            {detail}
          </VadText>
        ) : null}
      </View>
      <MarketCard market={market} onPress={onPress} />
    </View>
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
