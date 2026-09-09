import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadText } from '@/components/ui/vad-text';
import { MarketCard } from '@/features/markets/components/market-card';
import { money } from '@/features/markets/format';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem, WalletRow } from '@/services/market-api';

export function HomeScreen({ email, markets, ngn, canCreatePost, onOpenMarket, onExploreMarkets }: {
  email: string;
  markets: MarketCatalogItem[];
  ngn?: WalletRow;
  canCreatePost: boolean;
  onOpenMarket: (market: MarketCatalogItem) => void;
  onExploreMarkets: () => void;
}) {
  const theme = useVadTheme();
  const active = markets.filter((market) => market.status === 'OPEN' || market.status === 'ACTIVE');
  const categories = [...new Set(markets.map((market) => market.category).filter(Boolean))].slice(0, 6) as string[];
  const featured = [...markets].sort((a, b) => Number(Boolean(b.last_trade_at)) - Number(Boolean(a.last_trade_at)) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 3);

  return <View style={{ gap: theme.spacing.xxl }}>
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <VadText variant="label" tone="brand">VAD MARKET INTELLIGENCE</VadText>
          <VadText variant="display">What does the crowd believe?</VadText>
        </View>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: active.length ? theme.colors.yes : theme.colors.warning }} />
      </View>
      <VadText tone="secondary">Live probabilities, transparent rules and public conviction in one place. Follow the signal, inspect the evidence, then decide your position.</VadText>
      <VadText variant="caption" tone="tertiary">{email}</VadText>
    </View>

    <VadCard style={{ backgroundColor: theme.colors.brandPrimary, borderColor: theme.colors.brandPrimary, borderRadius: theme.radius.xl, gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: theme.spacing.xxs }}><VadText variant="caption" tone="inverse">Available to trade</VadText><VadText variant="display" tone="inverse">{money(ngn?.available)}</VadText></View>
        <View style={{ alignItems: 'flex-end', gap: theme.spacing.xxs }}><VadText variant="caption" tone="inverse">Reserved</VadText><VadText variant="bodyStrong" tone="inverse">{money(ngn?.reserved)}</VadText></View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
        <VadText variant="caption" tone="inverse">{active.length} live markets now</VadText>
        <Pressable onPress={onExploreMarkets} style={{ backgroundColor: theme.colors.onBrand, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm }}><VadText variant="label" tone="brand">Explore markets</VadText></Pressable>
      </View>
    </VadCard>

    <View style={{ gap: theme.spacing.md }}>
      <VadSectionHeader title="Discover markets" subtitle={`${active.length} live · ${markets.length} total`} actionLabel="See all" onAction={onExploreMarkets} />
      {categories.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>{categories.map((category) => <Pressable key={category} onPress={onExploreMarkets} style={{ borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs }}><VadText variant="caption" tone="secondary">{category}</VadText></Pressable>)}</View> : null}
      <View style={{ gap: theme.spacing.md }}>{featured.map((market) => <MarketCard key={market.instrument_public_id} market={market} onPress={() => onOpenMarket(market)} />)}</View>
      {!featured.length ? <VadEmptyState title="No live markets yet" body="Approved canonical markets will appear here automatically once governance activates them." /> : null}
    </View>

    <View style={{ gap: theme.spacing.md }}>
      <VadSectionHeader title="Conviction feed" subtitle="People, probabilities and the reasoning behind each call." />
      <SocialConvictionFeed markets={markets} canCreatePost={canCreatePost} onOpenMarket={onOpenMarket} />
    </View>
  </View>;
}
