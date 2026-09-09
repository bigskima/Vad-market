import { Pressable, View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { MarketCard } from '@/features/markets/components/market-card';
import { money } from '@/features/markets/format';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem, WalletRow } from '@/services/market-api';
import { HomeMarketPulse } from './components/home-market-pulse';

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
  const featured = [...markets].sort((a, b) => Number(Boolean(b.last_trade_at)) - Number(Boolean(a.last_trade_at)) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 2);

  return <View style={{ gap: theme.spacing.xl }}>
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.yes }} /><VadText variant="label" tone="brand">VAD LIVE</VadText></View>
      <VadText variant="display">See what the market believes next.</VadText>
      <VadText tone="secondary">Conviction is visible. Truth is governed. Explore live questions, follow strong reasoning and trade only when the resolution rules are clear.</VadText>
    </View>

    <VadCard style={{ backgroundColor: theme.colors.brandPrimary, borderColor: theme.colors.brandPrimary, gap: theme.spacing.md, padding: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}><VadText variant="caption" tone="inverse">AVAILABLE TO DEPLOY</VadText><VadText variant="display" tone="inverse">{money(ngn?.available)}</VadText><VadText variant="caption" tone="inverse">NGN balance · {money(ngn?.reserved)} reserved</VadText></View>
        <View style={{ borderRadius: 999, backgroundColor: theme.colors.onBrand, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}><VadText variant="caption" tone="brand">{active.length} LIVE</VadText></View>
      </View>
      <Pressable onPress={onExploreMarkets} style={{ alignSelf: 'flex-start', backgroundColor: theme.colors.onBrand, borderRadius: 999, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm }}><VadText variant="label" tone="brand">Explore markets →</VadText></Pressable>
    </VadCard>

    <HomeMarketPulse markets={markets} onOpenMarket={onOpenMarket} />

    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View><VadText variant="heading">Discover</VadText><VadText variant="caption" tone="secondary">Questions moving through VAD right now</VadText></View><Pressable onPress={onExploreMarkets}><VadText variant="label" tone="brand">See all</VadText></Pressable></View>
      {categories.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>{categories.map((category) => <View key={category} style={{ borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}><VadText variant="caption" tone="secondary">{category}</VadText></View>)}</View> : null}
      {featured.map((market) => <MarketCard key={market.instrument_public_id} market={market} onPress={() => onOpenMarket(market)} />)}
      {!featured.length ? <VadEmptyState title="No live markets yet" body="Approved canonical markets will appear here automatically once governance activates them." /> : null}
    </View>

    <View style={{ gap: theme.spacing.xs }}><VadText variant="heading">Conviction feed</VadText><VadText variant="caption" tone="secondary">Reasoning, predictions and market-linked views from the VAD network.</VadText></View>
    <SocialConvictionFeed markets={markets} canCreatePost={canCreatePost} onOpenMarket={onOpenMarket} />
    <VadText variant="caption" tone="secondary">Signed in as {email}</VadText>
  </View>;
}
