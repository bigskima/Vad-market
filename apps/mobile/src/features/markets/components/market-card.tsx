import { Pressable, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { pct } from '../format';

export function MarketCard({ market, onPress }: { market: MarketCatalogItem; onPress: () => void }) {
  const theme = useVadTheme();
  const isOpen = market.status === 'OPEN' || market.status === 'ACTIVE';
  const closesLabel = market.closes_at
    ? new Date(market.closes_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : 'TBD';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.xl,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.md,
        gap: theme.spacing.md,
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center', flex: 1 }}>
          <VadText variant="caption" tone="secondary">{market.category ?? 'General'}</VadText>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.borderStrong }} />
          <VadText variant="caption" tone={isOpen ? 'yes' : 'tertiary'}>{isOpen ? 'LIVE' : market.status}</VadText>
        </View>
        <VadText variant="caption" tone="tertiary">Closes {closesLabel}</VadText>
      </View>

      <VadText variant="heading" numberOfLines={3}>{market.title}</VadText>

      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
        <View style={{ flex: 1, borderRadius: theme.radius.lg, backgroundColor: theme.colors.yesSoft, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm }}>
          <VadText variant="caption" tone="secondary">YES</VadText>
          <VadText variant="heading" tone="yes">{pct(market.yes_price)}</VadText>
        </View>
        <View style={{ flex: 1, borderRadius: theme.radius.lg, backgroundColor: theme.colors.noSoft, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm }}>
          <VadText variant="caption" tone="secondary">NO</VadText>
          <VadText variant="heading" tone="no">{pct(market.no_price)}</VadText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
        <VadText variant="caption" tone="tertiary">
          {market.last_trade_at ? 'Recently traded' : 'Price forming'}
        </VadText>
        <VadText variant="label" tone="brand">Open market →</VadText>
      </View>
    </Pressable>
  );
}
