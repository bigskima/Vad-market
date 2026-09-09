import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { pct } from '../format';
import { MarketProbabilityBar } from './market-probability-bar';

export function MarketCard({ market, onPress }: { market: MarketCatalogItem; onPress: () => void }) {
  const theme = useVadTheme();
  const isOpen = market.status === 'OPEN' || market.status === 'ACTIVE';

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <VadCard variant="surface" style={{ gap: theme.spacing.md, opacity: pressed ? 0.82 : 1, borderRadius: theme.radius.xl }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                <View style={{ backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xxs }}><VadText variant="caption" tone="secondary">{market.category ?? 'General'}</VadText></View>
                <View style={{ backgroundColor: isOpen ? theme.colors.yesSoft : theme.colors.surfaceMuted, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xxs }}><VadText variant="caption" tone={isOpen ? 'yes' : 'tertiary'}>{isOpen ? 'LIVE' : market.status}</VadText></View>
              </View>
              <VadText variant="heading">{market.title}</VadText>
              <VadText variant="caption" tone="secondary">Settles in {market.asset_code} · tap for rules, evidence and order book</VadText>
            </View>
          </View>

          <MarketProbabilityBar yes={market.yes_price} no={market.no_price} />

          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            <View style={{ flex: 1, backgroundColor: theme.colors.yesSoft, borderRadius: theme.radius.lg, padding: theme.spacing.sm }}>
              <VadText variant="caption" tone="secondary">Market price</VadText><VadText variant="bodyStrong" tone="yes">YES {pct(market.yes_price)}</VadText>
            </View>
            <View style={{ flex: 1, backgroundColor: theme.colors.noSoft, borderRadius: theme.radius.lg, padding: theme.spacing.sm }}>
              <VadText variant="caption" tone="secondary">Market price</VadText><VadText variant="bodyStrong" tone="no">NO {pct(market.no_price)}</VadText>
            </View>
          </View>
        </VadCard>
      )}
    </Pressable>
  );
}
