import { Pressable, ScrollView, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadText } from '@/components/ui/vad-text';
import { HomePromotionCarousel } from '@/features/home/components/home-promotion-carousel';
import { MarketCard } from '@/features/markets/components/market-card';
import { probability } from '@/features/markets/format';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type {
  FeaturedMarketRow,
  HomePromotion,
} from '@/services/home-content-api';
import type { MarketCatalogItem } from '@/services/market-api';

export function HomeScreen({
  markets,
  promotions,
  featuredMarkets,
  onOpenMarket,
  onOpenPromotion,
  onExploreMarkets,
  onOpenCommunity,
}: {
  markets: MarketCatalogItem[];
  promotions: HomePromotion[];
  featuredMarkets: FeaturedMarketRow[];
  onOpenMarket: (market: MarketCatalogItem) => void;
  onOpenPromotion: (targetPath: string) => void;
  onExploreMarkets: (category?: string) => void;
  onOpenCommunity: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const desktopMarketGrid = density.desktop;

  const active = markets.filter(
    (market) => market.status === 'OPEN' || market.status === 'ACTIVE',
  );
  const categories = [
    ...new Set(markets.map((market) => market.category).filter(Boolean)),
  ].slice(0, 8) as string[];
  const curated = featuredMarkets
    .map((featured) =>
      markets.find(
        (market) => market.instrument_public_id === featured.instrument_public_id,
      ),
    )
    .filter((market): market is MarketCatalogItem => Boolean(market));
  const featuredLead = curated[0];
  const featuredRail = curated.slice(1, 5);
  const trending = [...markets]
    .sort(
      (a, b) =>
        Number(Boolean(b.last_trade_at)) - Number(Boolean(a.last_trade_at)) ||
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .filter(
      (market) =>
        !curated.some(
          (featured) => featured.instrument_public_id === market.instrument_public_id,
        ),
    )
    .slice(0, 5);
  const sectionGap = density.compact ? theme.spacing.lg : theme.spacing.xl;
  const traded = markets.filter((market) => Boolean(market.last_trade_at)).length;

  return (
    <View style={{ gap: sectionGap }}>
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
            Discover markets, inspect live probabilities and move from research to a position without losing context.
          </VadText>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: density.compact ? 6 : theme.spacing.xs }}>
          <VadChip label={`${active.length} live`} tone="yes" />
          <VadChip label={`${categories.length} categories`} />
          <VadChip label={`${traded} recently traded`} />
        </View>

        <Pressable
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

      <HomePromotionCarousel promotions={promotions} onOpen={onOpenPromotion} />

      <View style={{ gap: density.compact ? 8 : theme.spacing.sm }}>
        <VadSectionHeader
          title="Featured markets"
          subtitle="Markets selected by VAD for visibility."
          actionLabel="All markets"
          onAction={() => onExploreMarkets()}
        />

        {featuredLead ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Spotlight market={featuredLead} onPress={() => onOpenMarket(featuredLead)} />
            {featuredRail.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.md }}
              >
                {featuredRail.map((market) => (
                  <View
                    key={market.instrument_public_id}
                    style={{ width: Math.min(density.width - (density.narrow ? 36 : 44), 316) }}
                  >
                    <MarketCard market={market} onPress={() => onOpenMarket(market)} />
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : (
          <VadCard
            variant="raised"
            style={{ minHeight: density.compact ? 98 : 112, justifyContent: 'center', gap: 5 }}
          >
            <VadText variant="bodyStrong">Markets are forming.</VadText>
            <VadText variant="caption" tone="secondary">
              Published markets will appear here as soon as they go live.
            </VadText>
          </VadCard>
        )}
      </View>

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

      <View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
        <VadSectionHeader
          title="Trending now"
          subtitle="Markets with the freshest activity."
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
              Trading activity will appear here once markets begin filling.
            </VadText>
          </VadCard>
        )}
      </View>

      <View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
        <VadSectionHeader
          title="Community"
          subtitle="Reasoning from people watching the same markets."
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
    </View>
  );
}

function Spotlight({ market, onPress }: { market: MarketCatalogItem; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const yes = probability(market.yes_price);
  const no = probability(market.no_price);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open featured market: ${market.title}. YES ${yes}, NO ${no}. Settlement ${market.asset_code}.`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}
    >
      <View
        style={[
          theme.shadows.card,
          {
            minHeight: density.compact ? 126 : density.phone ? 140 : 168,
            borderRadius: density.cardRadius,
            backgroundColor: theme.colors.brandPrimary,
            padding: density.phone ? theme.spacing.lg : theme.spacing.xl,
            gap: density.compact ? 8 : theme.spacing.sm,
            justifyContent: 'space-between',
            overflow: 'hidden',
          },
        ]}
      >
        <View style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -70, top: -90, backgroundColor: theme.colors.brandAccent, opacity: 0.45 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
          <VadText variant="caption" tone="inverse">FEATURED</VadText>
          <VadText variant="caption" tone="inverse" numberOfLines={1}>
            {market.category ?? 'General'} · {market.asset_code}
          </VadText>
        </View>
        <VadText variant="heading" tone="inverse" numberOfLines={density.compact ? 2 : 3}>
          {market.title}
        </VadText>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <Signal label="YES" value={yes} />
          <Signal label="NO" value={no} />
        </View>
      </View>
    </Pressable>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  const density = useProductDensity();
  return (
    <View style={{ flex: 1, gap: 0 }}>
      <VadText variant="caption" tone="inverse">{label}</VadText>
      <VadText variant={density.compact ? 'heading' : 'title'} tone="inverse">{value}</VadText>
    </View>
  );
}
