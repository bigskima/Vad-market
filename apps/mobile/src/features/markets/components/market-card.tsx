import { Pressable, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { pct } from '../format';

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
    ? new Date(market.closes_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : 'TBD';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 220,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.xl,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.md,
        gap: theme.spacing.md,
        justifyContent: 'space-between',
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <View style={{ gap: theme.spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: theme.spacing.sm,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.xs,
              alignItems: 'center',
              flex: 1,
            }}
          >
            <VadText variant="caption" tone="secondary">
              {market.category ?? 'General'}
            </VadText>
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.borderStrong,
              }}
            />
            <VadText
              variant="caption"
              tone={isOpen ? 'yes' : 'tertiary'}
            >
              {isOpen ? 'LIVE' : market.status}
            </VadText>
          </View>
          <VadText variant="caption" tone="tertiary">
            {closesLabel}
          </VadText>
        </View>

        <VadText variant="heading" numberOfLines={3}>
          {market.title}
        </VadText>

        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          <Outcome
            label="YES"
            value={pct(market.yes_price)}
            positive
          />
          <Outcome
            label="NO"
            value={pct(market.no_price)}
            positive={false}
          />
        </View>
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingTop: theme.spacing.sm,
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
          alignItems: 'center',
        }}
      >
        <VadText variant="caption" tone="tertiary">
          {market.last_trade_at ? 'Recently traded' : 'Price forming'}
        </VadText>
        <VadText variant="label" tone="brand">Open →</VadText>
      </View>
    </Pressable>
  );
}

function Outcome({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        flex: 1,
        borderRadius: theme.radius.lg,
        backgroundColor: positive ? theme.colors.yesSoft : theme.colors.noSoft,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <VadText variant="heading" tone={positive ? 'yes' : 'no'}>
        {value}
      </VadText>
    </View>
  );
}
