import {
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadText } from '@/components/ui/vad-text';
import { MarketCard } from '@/features/markets/components/market-card';
import { money, pct } from '@/features/markets/format';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem, WalletRow } from '@/services/market-api';

export function HomeScreen({
  markets,
  ngn,
  onOpenMarket,
  onExploreMarkets,
  onOpenWallet,
  onOpenCommunity,
}: {
  markets: MarketCatalogItem[];
  ngn?: WalletRow;
  onOpenMarket: (market: MarketCatalogItem) => void;
  onExploreMarkets: (category?: string) => void;
  onOpenWallet: () => void;
  onOpenCommunity: () => void;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const desktopMarketGrid = width >= 960;

  const active = markets.filter((market) => market.status === 'OPEN' || market.status === 'ACTIVE');
  const categories = [...new Set(markets.map((market) => market.category).filter(Boolean))].slice(0, 8) as string[];
  const featured = [...markets]
    .sort((a, b) => Number(Boolean(b.last_trade_at)) - Number(Boolean(a.last_trade_at)) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);
  const spotlight = featured[0];
  const trending = featured.slice(1);

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View style={{ gap: theme.spacing.sm }}>
        <VadText variant="caption" tone="brand">VAD MARKET</VadText>
        <VadText variant="title">Price the outcome. Back your conviction.</VadText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          <VadChip label={`${active.length} live`} tone="yes" />
          <VadChip label={`${categories.length} categories`} />
          <VadChip label={`${markets.filter((market) => market.last_trade_at).length} recently traded`} />
        </View>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.md }}>
        <WalletSnapshot ngn={ngn} onPress={onOpenWallet} />
        {spotlight ? (
          <Spotlight market={spotlight} onPress={() => onOpenMarket(spotlight)} />
        ) : (
          <VadCard style={{ flex: 1, justifyContent: 'center', minHeight: 176, gap: theme.spacing.sm }}>
            <VadText variant="heading">Markets are forming.</VadText>
            <VadText tone="secondary">Approved markets will appear here as soon as they go live.</VadText>
          </VadCard>
        )}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <VadSectionHeader title="Explore" subtitle="Jump straight into a category." actionLabel="All markets" onAction={() => onExploreMarkets()} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.xs, paddingRight: theme.spacing.md }}>
          <VadChip label="All markets" selected tone="brand" onPress={() => onExploreMarkets()} />
          {categories.map((category) => (
            <VadChip key={category} label={category} onPress={() => onExploreMarkets(category)} />
          ))}
        </ScrollView>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <VadSectionHeader title="Trending now" subtitle="Markets with the freshest activity." actionLabel="See all" onAction={() => onExploreMarkets()} />
        {trending.length ? (
          desktopMarketGrid ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, alignItems: 'stretch' }}>
              {trending.map((market) => (
                <View key={market.instrument_public_id} style={{ flexGrow: 1, flexBasis: 360, minWidth: 0 }}>
                  <MarketCard market={market} onPress={() => onOpenMarket(market)} />
                </View>
              ))}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.md, paddingRight: theme.spacing.md }}>
              {trending.map((market) => (
                <View key={market.instrument_public_id} style={{ width: Math.min(width - 52, 332) }}>
                  <MarketCard market={market} onPress={() => onOpenMarket(market)} />
                </View>
              ))}
            </ScrollView>
          )
        ) : null}
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <VadSectionHeader title="Community" subtitle="Reasoning from people watching the same markets." actionLabel="Open feed" onAction={onOpenCommunity} />
        <SocialConvictionFeed markets={markets} canCreatePost={false} showComposer={false} maxPosts={3} onOpenMarket={onOpenMarket} />
      </View>
    </View>
  );
}

function WalletSnapshot({ ngn, onPress }: { ngn?: WalletRow; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open Wallet" onPress={onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}>
      <VadCard variant="brand" style={{ minHeight: 176, gap: theme.spacing.lg, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <VadIcon name="wallet" size={21} tone="brand" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <VadText variant="label" tone="brand">Wallet</VadText>
            <VadIcon name="chevronRight" size={16} tone="brand" />
          </View>
        </View>
        <View style={{ gap: 2 }}>
          <VadText variant="caption" tone="secondary">AVAILABLE TO USE</VadText>
          <VadText variant="display" numberOfLines={1} adjustsFontSizeToFit>{money(ngn?.available)}</VadText>
        </View>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xl }}>
          <Metric label="Reserved" value={money(ngn?.reserved)} />
          <Metric label="Pending" value={money(ngn?.withdrawal_pending)} />
        </View>
      </VadCard>
    </Pressable>
  );
}

function Spotlight({ market, onPress }: { market: MarketCatalogItem; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1.15, opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}>
      <View style={{ minHeight: 176, borderRadius: theme.radius.xl, backgroundColor: theme.colors.brandPrimary, padding: theme.spacing.lg, gap: theme.spacing.md, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
          <VadText variant="caption" tone="inverse">TRENDING</VadText>
          <VadText variant="caption" tone="inverse">{market.category ?? 'General'}</VadText>
        </View>
        <VadText variant="heading" tone="inverse" numberOfLines={3}>{market.title}</VadText>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <Signal label="YES" value={pct(market.yes_price)} />
          <Signal label="NO" value={pct(market.no_price)} />
        </View>
      </View>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1}>{value}</VadText>
    </View>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 1 }}>
      <VadText variant="caption" tone="inverse">{label}</VadText>
      <VadText variant="title" tone="inverse">{value}</VadText>
    </View>
  );
}
