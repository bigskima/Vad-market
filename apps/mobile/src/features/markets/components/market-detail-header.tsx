import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { probability } from '../format';
import { MarketProbabilityBar } from './market-probability-bar';

export function MarketDetailHeader({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const live = market.status === 'OPEN' || market.status === 'ACTIVE';
  const yes = probability(market.yes_price);
  const no = probability(market.no_price);
  const hasPrice = market.yes_price != null || market.no_price != null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
        <VadChip label={market.category ?? 'General'} tone="brand" />
        <VadChip label={marketStatusLabel(market.status)} tone={live ? 'yes' : 'neutral'} />
        <VadChip label={market.asset_code} />
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
            ? 'Prices show current trading conviction. The published market rules determine the final result.'
            : 'No trade price is available yet. A probability will appear after price discovery begins.'}
        </VadText>
      </VadCard>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        <MetaChip label="Currency" value={market.asset_code} />
        <MetaChip label="Closes" value={market.closes_at ? new Date(market.closes_at).toLocaleString() : 'Closing time unavailable'} />
        <MetaChip label="Type" value={friendlyEnum(market.market_type)} />
        <MetaChip label="Last trade" value={market.last_trade_at ? new Date(market.last_trade_at).toLocaleString() : 'No trades yet'} />
      </View>
    </View>
  );
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
    <View style={{ minHeight: 44, flexGrow: 1, flexBasis: 130, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.sm, paddingVertical: 6, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="caption" numberOfLines={2}>{value}</VadText>
    </View>
  );
}
