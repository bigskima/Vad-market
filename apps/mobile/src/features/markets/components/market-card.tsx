import { Pressable, View } from 'react-native';

import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { pct } from '../format';
import { MarketProbabilityBar } from './market-probability-bar';

export function MarketCard({
  market,
  onPress,
}: {
  market: MarketCatalogItem;
  onPress: () => void;
}) {
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
        minHeight: 196,
        borderWidth: 1,
        borderColor: pressed ? theme.colors.borderStrong : theme.colors.border,
        borderRadius: theme.radius.xl,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
        justifyContent: 'space-between',
        opacity: pressed ? 0.82 : 1,
        transform: [{ scale: pressed ? 0.992 : 1 }],
      })}
    >
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center', flex: 1 }}>
            {isOpen ? <VadChip label="LIVE" tone="yes" /> : <VadChip label={market.status} />}
            <VadText variant="caption" tone="secondary" numberOfLines={1}>{market.category ?? 'General'}</VadText>
          </View>
          <VadText variant="caption" tone="tertiary">Closes {closesLabel}</VadText>
        </View>

        <VadText variant="heading" numberOfLines={3}>{market.title}</VadText>

        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <PriceTile label="YES" value={pct(market.yes_price)} positive />
            <PriceTile label="NO" value={pct(market.no_price)} positive={false} />
          </View>
          <MarketProbabilityBar yes={market.yes_price} no={market.no_price} />
        </View>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
        <VadText variant="caption" tone="tertiary">{market.last_trade_at ? 'Recently traded' : 'Price forming'}</VadText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <VadText variant="label" tone="brand">View market</VadText>
          <VadIcon name="chevronRight" size={16} tone="brand" />
        </View>
      </View>
    </Pressable>
  );
}

function PriceTile({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  const theme = useVadTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: theme.radius.lg, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, backgroundColor: positive ? theme.colors.yesSoft : theme.colors.noSoft, gap: 1 }}>
      <VadText variant="caption" tone={positive ? 'yes' : 'no'}>{label}</VadText>
      <VadText variant="heading" tone={positive ? 'yes' : 'no'}>{value}</VadText>
    </View>
  );
}
