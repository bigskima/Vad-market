import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { pct } from '../format';

export function MarketDetailHeader({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  return <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
        <VadText variant="caption" tone="brand">{(market.category ?? 'GENERAL').toUpperCase()}</VadText>
        <VadText variant="caption" tone="secondary">{market.asset_code} · {market.status}</VadText>
      </View>
      <VadText variant="title">{market.title}</VadText>
      <VadText tone="secondary">{market.closes_at ? `Closes ${new Date(market.closes_at).toLocaleString()}` : 'Close time governed by market policy'}</VadText>
    </View>
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
      <OutcomeBox label="YES" value={pct(market.yes_price)} background={theme.colors.yesSoft} color={theme.colors.yes} />
      <OutcomeBox label="NO" value={pct(market.no_price)} background={theme.colors.noSoft} color={theme.colors.no} />
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
      <Meta label="Type" value={market.market_type} />
      <Meta label="Last trade" value={market.last_trade_at ? new Date(market.last_trade_at).toLocaleTimeString() : 'No fills yet'} />
    </View>
  </VadCard>;
}

function OutcomeBox({ label, value, background, color }: { label: string; value: string; background: string; color: string }) {
  return <View style={{ flex: 1, borderRadius: 18, padding: 14, backgroundColor: background, gap: 2 }}><VadText variant="caption" style={{ color }}>{label}</VadText><VadText variant="heading" style={{ color }}>{value}</VadText></View>;
}

function Meta({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}><VadText variant="caption" tone="secondary">{label}: {value}</VadText></View>;
}
