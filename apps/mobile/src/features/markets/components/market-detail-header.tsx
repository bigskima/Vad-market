import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import { useLiveNow } from '@/hooks/use-live-now';
import { exactTime, getMarketTiming } from '@/lib/market-timing';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { probability } from '../format';
import { MarketProbabilityBar } from './market-probability-bar';

export function MarketDetailHeader({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const now = useLiveNow();
  const timing = getMarketTiming(market, now);
  const live = timing.tradingOpen;
  const yes = probability(market.yes_price);
  const no = probability(market.no_price);
  const hasPrice = market.yes_price != null || market.no_price != null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
        <VadChip label={market.category ?? 'General'} tone="brand" />
        <VadChip label={timing.statusLabel.toUpperCase()} tone={live ? 'yes' : timing.stage === 'SETTLED' ? 'yes' : timing.stage === 'SETTLEMENT_PENDING' ? 'brand' : 'neutral'} />
        <VadChip label={market.asset_code} />
        {timing.resolutionOutcome ? <VadChip label={`RESULT ${timing.resolutionOutcome}`} tone={timing.resolutionOutcome === 'YES' ? 'yes' : 'no'} /> : null}
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
            ? 'Prices show where traders currently stand. The market rules determine the final result.'
            : 'No trade price is available yet. Probabilities will appear after trading begins.'}
        </VadText>
      </VadCard>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        <MetaChip label="Currency" value={market.asset_code} />
        <MetaChip label="Lifecycle" value={timing.primaryTiming} />
        {timing.stage === 'SCHEDULED' && market.opens_at ? <MetaChip label="Opens" value={`In ${timing.openCountdown ?? '—'}`} /> : null}
        {timing.stage === 'OPEN' ? <MetaChip label="Trading closes" value={timing.closeCountdown ? `In ${timing.closeCountdown}` : 'Closing time unavailable'} /> : null}
        {(timing.stage === 'CLOSED' || timing.stage === 'RESOLVING') ? <MetaChip label="Result" value={timing.resolutionCountdown ? `Check in ${timing.resolutionCountdown}` : timing.resolutionOutcome ? `Final · ${timing.resolutionOutcome}` : 'Processing'} /> : null}
        <MetaChip label="Type" value={friendlyEnum(market.market_type)} />
      </View>

      {(market.opens_at || market.closes_at || market.resolves_after) ? (
        <VadText variant="caption" tone="tertiary">
          {[
            market.opens_at ? `Opens ${exactTime(market.opens_at)}` : null,
            market.closes_at ? `Closes ${exactTime(market.closes_at)}` : null,
            market.resolves_after ? `Result check ${exactTime(market.resolves_after)}` : null,
          ].filter(Boolean).join(' · ')}
        </VadText>
      ) : null}
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
    <View style={{ minHeight: 44, flexGrow: 1, flexBasis: 130, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.sm, paddingVertical: 6, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="caption" numberOfLines={2}>{value}</VadText>
    </View>
  );
}
