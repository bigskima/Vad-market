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
        <VadText variant="label" tone="brand">MARKET SIGNAL</VadText>
        <VadText variant="heading">Current conviction</VadText>
        <VadText variant="caption" tone="secondary">Prices show participant belief. They do not determine the final outcome.</VadText>
      </View>
      <View style={{ borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, backgroundColor: open ? theme.colors.yesSoft : theme.colors.surfaceMuted }}>
        <VadText variant="caption" tone={open ? 'yes' : 'secondary'}>{open ? 'LIVE' : market.status}</VadText>
      </View>
    </View>
    <MarketProbabilityBar yes={market.yes_price} no={market.no_price} />
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
      <Metric label="Asset" value={market.asset_code} />
      <Metric label="Category" value={market.category ?? 'General'} />
    </View>
  </VadCard>;
}

function Metric({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return <VadCard variant="muted" style={{ flex: 1, padding: theme.spacing.sm }}>
    <VadText variant="caption" tone="secondary">{label}</VadText>
    <VadText variant="bodyStrong">{value}</VadText>
  </VadCard>;
}
