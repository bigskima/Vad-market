import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import { useLiveNow } from '@/hooks/use-live-now';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { probability } from '../format';
import { formatRelativeTimestamp, marketStatusMeta } from '../market-state';
import { MarketProbabilityBar } from './market-probability-bar';
import { MarketTimeStatus } from './market-time-status';

export function MarketDetailHeader({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const now = useLiveNow();
  const status = marketStatusMeta(market.status);
  const yes = probability(market.yes_price);
  const no = probability(market.no_price);
  const hasPrice = market.yes_price != null || market.no_price != null;
  const lastTrade = formatRelativeTimestamp(market.last_trade_at, now);

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
        <VadChip label={status.label} tone={status.tone} />
        <VadChip label={market.asset_code} tone="brand" />
        <VadText variant="caption" tone="secondary">{market.category ?? 'General'} · {friendlyEnum(market.market_type)}</VadText>
      </View>

      <VadText variant={density.compact ? 'heading' : 'title'}>{market.title}</VadText>

      <VadCard accessibilityRole="summary" variant="raised" style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          <SignalTile label="YES" value={yes} positive available={market.yes_price != null} />
          <SignalTile label="NO" value={no} positive={false} available={market.no_price != null} />
        </View>
        <MarketProbabilityBar yes={market.yes_price} no={market.no_price} />
        <VadText variant="caption" tone="tertiary">
          {hasPrice
            ? 'These prices show current market conviction. The published evidence rules still determine the final YES or NO.'
            : 'No trade price is available yet. Conviction signals appear after trading begins.'}
        </VadText>
      </VadCard>

      <MarketTimeStatus market={market} showAbsolute />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        <MetaChip label="State" value={status.detail} />
        <MetaChip label="Activity" value={lastTrade ? `Traded ${lastTrade}` : 'No trades yet'} />
      </View>
    </View>
  );
}

function friendlyEnum(value: string) {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function SignalTile({ label, value, positive, available }: { label: string; value: string; positive: boolean; available: boolean }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: theme.radius.md, backgroundColor: available ? (positive ? theme.colors.yesSoft : theme.colors.noSoft) : theme.colors.surfaceMuted, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, gap: 1 }}>
      <VadText variant="caption" tone={available ? (positive ? 'yes' : 'no') : 'tertiary'}>{label}</VadText>
      <VadText variant={density.compact ? 'bodyStrong' : 'heading'} tone={available ? (positive ? 'yes' : 'no') : 'tertiary'} numberOfLines={1}>{value}</VadText>
    </View>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 48, flexGrow: 1, flexBasis: 145, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.sm, paddingVertical: 7, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="caption" numberOfLines={2}>{value}</VadText>
    </View>
  );
}
