import { router } from 'expo-router';
import { View, type DimensionValue } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { assetMoney, pct } from '@/features/markets/format';
import { useProductDensity } from '@/hooks/use-product-density';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function PortfolioPositionScreen({ instrumentId, outcomeCode }: { instrumentId: string; outcomeCode: string }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 820;
  const data = useProductDataContext();

  const position = data.positions.find((row) => String(row.instrument_id) === instrumentId && row.outcome_code === outcomeCode);

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.sm }}>
        <VadSkeleton height={density.compact ? 104 : 124} radius={density.cardRadius} />
        <VadSkeleton height={92} radius={density.cardRadius} />
        <VadSkeleton height={116} radius={density.cardRadius} />
      </View>
    );
  }

  if (!position && data.sectionErrors.positions) return <VadErrorState title="Position could not be loaded" message={data.sectionErrors.positions} onRetry={() => void data.load()} />;
  if (!position) return <VadEmptyState title="Position unavailable" body="This position is no longer present in your active portfolio." />;

  const yes = position.outcome_code === 'YES';
  const shares = Number(position.quantity);
  const average = Number(position.average_price);
  const costBasis = Number(position.total_cost_basis);
  const assetPortfolioCost = data.positions
    .filter((row) => row.asset_code === position.asset_code)
    .reduce((sum, row) => sum + Number(row.total_cost_basis ?? 0), 0);
  const portfolioWeight = assetPortfolioCost > 0 ? costBasis / assetPortfolioCost : 0;
  const allocationWidth = `${Math.max(0, Math.min(100, Math.round(portfolioWeight * 100)))}%` as DimensionValue;

  return (
    <View style={{ gap: density.sectionGap }}>
      <View style={{ gap: theme.spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
          <VadChip label={`${position.outcome_code} position`} tone={yes ? 'yes' : 'no'} />
          <VadChip label={position.asset_code} tone="brand" />
          <VadChip label={position.status.replaceAll('_', ' ')} />
        </View>
        <VadText variant="heading">{position.market_title}</VadText>
        <VadText variant="caption" tone="secondary">Recorded holdings and cost basis only. VAD does not invent unrealized P/L without an authoritative pricing field.</VadText>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.md }}>
        <VadCard style={{ flex: 1.1, borderColor: yes ? theme.colors.yes : theme.colors.no, gap: theme.spacing.sm }}>
          <VadText variant="caption" tone={yes ? 'yes' : 'no'}>RECORDED COST BASIS · {position.asset_code}</VadText>
          <VadText variant="display" numberOfLines={1} adjustsFontSizeToFit>{assetMoney(costBasis, position.asset_code)}</VadText>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Snapshot label="Shares" value={shares.toLocaleString()} />
            <Snapshot label="Avg. entry" value={pct(average)} />
          </View>
        </VadCard>

        <VadCard variant="raised" style={{ flex: 0.9, gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 1 }}>
              <VadText variant="caption" tone="secondary">{position.asset_code} COST WEIGHT</VadText>
              <VadText variant="heading">{pct(portfolioWeight)}</VadText>
            </View>
            <VadText variant="caption" tone="tertiary">of {position.asset_code} positions</VadText>
          </View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(portfolioWeight * 100) }} style={{ height: 6, borderRadius: theme.radius.pill, overflow: 'hidden', backgroundColor: theme.colors.surfaceMuted }}>
            <View style={{ width: allocationWidth, height: '100%', backgroundColor: yes ? theme.colors.yes : theme.colors.no }} />
          </View>
          <VadText variant="caption" tone="secondary">Concentration is calculated only against positions using the same settlement asset.</VadText>
        </VadCard>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'flex-start', gap: theme.spacing.md }}>
        <VadCard style={{ flex: 1.1, width: '100%', gap: theme.spacing.xs }}>
          <VadText variant="bodyStrong">Position details</VadText>
          <Detail label="Outcome" value={position.outcome_code} tone={yes ? 'yes' : 'no'} />
          <Detail label="Settlement asset" value={position.asset_code} />
          <Detail label="Shares" value={shares.toLocaleString()} />
          <Detail label="Average entry" value={pct(average)} />
          <Detail label="Cost basis" value={assetMoney(costBasis, position.asset_code)} />
          <Detail label="Status" value={position.status.replaceAll('_', ' ')} />
        </VadCard>

        <VadCard variant="raised" style={{ flex: 0.9, width: '100%', gap: theme.spacing.sm }}>
          <VadText variant="bodyStrong">Asset context</VadText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            <ContextFact label={`${position.asset_code} portfolio cost`} value={assetMoney(assetPortfolioCost, position.asset_code)} />
            <ContextFact label="This position" value={assetMoney(costBasis, position.asset_code)} />
            <ContextFact label="Cost weight" value={pct(portfolioWeight)} />
          </View>
          <VadText variant="caption" tone="secondary">Filled trades change shares and cost basis. Resolution and settlement remain server-authoritative.</VadText>
          <VadButton
            label="Open market"
            variant="secondary"
            onPress={() => router.push({ pathname: '/market/[marketId]', params: { marketId: position.instrument_id } })}
          />
        </VadCard>
      </View>
    </View>
  );
}

function Snapshot({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function ContextFact({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: 110, minWidth: 0, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.sm, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function Detail({ label, value, tone = 'primary' }: { label: string; value: string; tone?: 'primary' | 'yes' | 'no' }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="bodyStrong" tone={tone} style={{ flex: 1.2, textAlign: 'right' }} numberOfLines={2}>{value}</VadText>
    </View>
  );
}
