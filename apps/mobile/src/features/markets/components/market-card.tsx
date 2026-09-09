import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { pct } from '../format';

export function MarketCard({ market, onPress }: { market: MarketCatalogItem; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <VadCard variant="surface" style={{ gap: theme.spacing.sm, opacity: pressed ? 0.8 : 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: theme.spacing.xxs }}>
              <VadText variant="bodyStrong">{market.title}</VadText>
              <VadText variant="caption" tone="secondary">{market.category ?? 'General'} · {market.asset_code}</VadText>
            </View>
            <VadText variant="caption" tone="tertiary">{market.status}</VadText>
          </View>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            <View style={{ flex: 1, backgroundColor: theme.colors.yesSoft, borderRadius: theme.radius.md, padding: theme.spacing.sm }}>
              <VadText variant="label" tone="yes">YES {pct(market.yes_price)}</VadText>
            </View>
            <View style={{ flex: 1, backgroundColor: theme.colors.noSoft, borderRadius: theme.radius.md, padding: theme.spacing.sm }}>
              <VadText variant="label" tone="no">NO {pct(market.no_price)}</VadText>
            </View>
          </View>
        </VadCard>
      )}
    </Pressable>
  );
}
