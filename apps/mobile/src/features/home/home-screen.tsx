import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { MarketCard } from '@/features/markets/components/market-card';
import { money } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem, WalletRow } from '@/services/market-api';

export function HomeScreen({ email, markets, ngn, canCreatePost, onOpenMarket }: {
  email: string;
  markets: MarketCatalogItem[];
  ngn?: WalletRow;
  canCreatePost: boolean;
  onOpenMarket: (market: MarketCatalogItem) => void;
}) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">OPEN CONVICTION · CONTROLLED TRUTH</VadText>
        <VadText variant="display">Markets built around what people believe next.</VadText>
        <VadText variant="caption" tone="secondary">{email}</VadText>
      </View>

      <VadCard style={{ backgroundColor: theme.colors.brandPrimary, borderColor: theme.colors.brandPrimary, gap: theme.spacing.xxs }}>
        <VadText variant="caption" tone="inverse">Available NGN</VadText>
        <VadText variant="display" tone="inverse">{money(ngn?.available)}</VadText>
        <VadText variant="caption" tone="inverse">Reserved {money(ngn?.reserved)}</VadText>
      </VadCard>

      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <VadText variant="heading">Live conviction</VadText>
          <VadText variant="caption" tone="secondary">{markets.length} markets</VadText>
        </View>
        {markets.slice(0, 3).map((market) => <MarketCard key={market.instrument_public_id} market={market} onPress={() => onOpenMarket(market)} />)}
        {!markets.length ? <VadCard variant="outlined"><VadText tone="secondary">No financial market is live yet. Approved canonical markets will appear automatically.</VadText></VadCard> : null}
      </View>

      <SocialConvictionFeed markets={markets} canCreatePost={canCreatePost} onOpenMarket={onOpenMarket} />
    </View>
  );
}
