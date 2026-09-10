import { useWindowDimensions, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { pct } from '../format';
import { MarketProbabilityBar } from './market-probability-bar';

export function MarketDetailHeader({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const yes = Number(market.yes_price ?? 0);
  const no = Number(market.no_price ?? Math.max(0, 1 - yes));
  const live = market.status === 'OPEN' || market.status === 'ACTIVE';

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
        <VadChip label={market.category ?? 'General'} tone="brand" />
        <VadChip label={live ? 'LIVE' : market.status} tone={live ? 'yes' : 'neutral'} />
        <VadChip label={market.asset_code} />
      </View>

      <VadText variant="title">{market.title}</VadText>

      <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.md }}>
          <SignalTile label="YES" value={pct(yes)} positive />
          <SignalTile label="NO" value={pct(no)} positive={false} />
        </View>

        <MarketProbabilityBar yes={yes} no={no} />

        <VadText variant="caption" tone="tertiary">
          Prices show current trading conviction. Final resolution remains independent of market popularity.
        </VadText>
      </VadCard>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        <MetaChip
          label="Closes"
          value={market.closes_at ? new Date(market.closes_at).toLocaleDateString() : 'By policy'}
        />
        <MetaChip label="Type" value={market.market_type} />
        <MetaChip label="Last trade" value={market.last_trade_at ? new Date(market.last_trade_at).toLocaleDateString() : 'No fills yet'} />
      </View>
    </View>
  );
}

function SignalTile({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  const theme = useVadTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: theme.radius.xl, backgroundColor: positive ? theme.colors.yesSoft : theme.colors.noSoft, padding: theme.spacing.lg, gap: 2 }}>
      <VadText variant="caption" tone={positive ? 'yes' : 'no'}>{label} PRICE</VadText>
      <VadText variant="display" tone={positive ? 'yes' : 'no'}>{value}</VadText>
    </View>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 42, flexGrow: 1, flexBasis: 130, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="caption" tone="primary" numberOfLines={1}>{value}</VadText>
    </View>
  );
}
