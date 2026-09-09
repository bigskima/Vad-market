import { Pressable, View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { MarketCard } from '@/features/markets/components/market-card';
import { money } from '@/features/markets/format';
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

  return <View style={{ gap: theme.spacing.xl }}>
    <View style={{ gap: theme.spacing.sm }}>
      <VadText variant="label" tone="brand">OPEN CONVICTION · CONTROLLED TRUTH</VadText>
      <VadText variant="display">See what the market believes next.</VadText>
      <VadText tone="secondary">Discover live questions, understand the evidence, follow strong thinkers and take a position only when the rules are clear.</VadText>
      <VadText variant="caption" tone="secondary">Signed in as {email}</VadText>
    </View>

    <VadCard style={{ backgroundColor: theme.colors.brandPrimary, borderColor: theme.colors.brandPrimary, gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}><View><VadText variant="caption" tone="inverse">Available NGN</VadText><VadText variant="display" tone="inverse">{money(ngn?.available)}</VadText></View><View style={{ alignItems: 'flex-end' }}><VadText variant="caption" tone="inverse">Reserved</VadText><VadText variant="bodyStrong" tone="inverse">{money(ngn?.reserved)}</VadText></View></View>
      <Pressable onPress={onExploreMarkets} style={{ alignSelf: 'flex-start', backgroundColor: theme.colors.onBrand, borderRadius: 999, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs }}><VadText variant="label" tone="brand">Explore markets</VadText></Pressable>
    </VadCard>

    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View><VadText variant="heading">Discover</VadText><VadText variant="caption" tone="secondary">{active.length} live · {markets.length} total markets</VadText></View><Pressable onPress={onExploreMarkets}><VadText variant="label" tone="brand">See all</VadText></Pressable></View>
      {categories.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>{categories.map((category) => <View key={category} style={{ borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}><VadText variant="caption" tone="secondary">{category}</VadText></View>)}</View> : null}
      {featured.map((market) => <MarketCard key={market.instrument_public_id} market={market} onPress={() => onOpenMarket(market)} />)}
      {!featured.length ? <VadEmptyState title="No live markets yet" body="Approved canonical markets will appear here automatically once governance activates them." /> : null}
    </View>

    <SocialConvictionFeed markets={markets} canCreatePost={canCreatePost} onOpenMarket={onOpenMarket} />
  </View>;
}
