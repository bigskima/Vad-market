import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { MarketProbabilityBar } from '@/features/markets/components/market-probability-bar';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export function MarketInsightPanel({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const open = market.status === 'OPEN' || market.status === 'ACTIVE';

  return <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <VadText variant="label" tone="brand">MARKET PRICE</VadText>
        <VadText variant="heading">What traders think now</VadText>
        <VadText variant="caption" tone="secondary">Prices show the current market view. The final result still follows the published rules.</VadText>
      </View>
      <View style={{ borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, backgroundColor: open ? theme.colors.yesSoft : theme.colors.surfaceMuted }}>
        <VadText variant="caption" tone={open ? 'yes' : 'secondary'}>{marketStatusLabel(market.status)}</VadText>
      </View>
    </View>
    <MarketProbabilityBar yes={market.yes_price} no={market.no_price} />
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
      <Metric label="Currency" value={market.asset_code} />
      <Metric label="Category" value={market.category ?? 'General'} />
    </View>
  </VadCard>;
}

function marketStatusLabel(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'OPEN' || normalized === 'ACTIVE') return 'LIVE';
  if (normalized === 'CLOSED') return 'CLOSED';
  if (normalized === 'RESOLVING') return 'RESULT PENDING';
  if (normalized === 'RESOLVED') return 'RESULT CONFIRMED';
  if (normalized === 'SETTLED') return 'COMPLETED';
  if (normalized === 'VOID') return 'CANCELLED';
  return 'UNAVAILABLE';
}

function Metric({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return <VadCard variant="muted" style={{ flex: 1, padding: theme.spacing.sm }}>
    <VadText variant="caption" tone="secondary">{label}</VadText>
    <VadText variant="bodyStrong">{value}</VadText>
  </VadCard>;
}
