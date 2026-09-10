import {
  useWindowDimensions,
  View,
  type DimensionValue,
} from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money, pct } from '@/features/markets/format';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function PortfolioPositionScreen({
  instrumentId,
  outcomeCode,
}: {
  instrumentId: string;
  outcomeCode: string;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const compact = width < 380;
  const data = useProductDataContext();

  const position = data.positions.find(
    (row) =>
      String(row.instrument_id) === instrumentId &&
      row.outcome_code === outcomeCode,
  );

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="60%" height={30} />
        <VadSkeleton height={160} radius={theme.radius.xl} />
        <VadSkeleton height={62} />
        <VadSkeleton height={62} />
      </View>
    );
  }

  if (!position && data.sectionErrors.positions) {
    return (
      <VadErrorState
        title="Position could not be loaded"
        message={data.sectionErrors.positions}
        onRetry={() => void data.load()}
      />
    );
  }

  if (!position) {
    return (
      <VadEmptyState
        title="Position unavailable"
        body="This position is no longer present in your active portfolio."
      />
    );
  }

  const yes = position.outcome_code === 'YES';
  const shares = Number(position.quantity);
  const average = Number(position.average_price);
  const costBasis = Number(position.total_cost_basis);
  const portfolioCost = data.positions.reduce(
    (sum, row) => sum + Number(row.total_cost_basis ?? 0),
    0,
  );
  const portfolioWeight = portfolioCost > 0 ? costBasis / portfolioCost : 0;
  const allocationWidth = `${Math.max(
    0,
    Math.min(100, Math.round(portfolioWeight * 100)),
  )}%` as DimensionValue;

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View style={{ gap: theme.spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            flexWrap: 'wrap',
          }}
        >
          <VadText variant="label" tone={yes ? 'yes' : 'no'}>
            {position.outcome_code} POSITION
          </VadText>
          <VadText variant="caption" tone="tertiary">·</VadText>
          <VadText variant="caption" tone="secondary">
            {position.status.replaceAll('_', ' ')}
          </VadText>
        </View>

        <VadText variant="title">{position.market_title}</VadText>
        <VadText tone="secondary">
          This screen shows recorded holdings and cost basis only. It does not
          invent a current market value or unrealized P/L when no authoritative
          portfolio pricing field is available.
        </VadText>
      </View>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1.15,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: yes ? theme.colors.yes : theme.colors.no,
            paddingVertical: compact ? theme.spacing.md : theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <VadText variant="caption" tone={yes ? 'yes' : 'no'}>
            RECORDED COST BASIS
          </VadText>
          <VadText variant="display" numberOfLines={1} adjustsFontSizeToFit>
            {money(costBasis)}
          </VadText>
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              paddingTop: theme.spacing.md,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing.xl,
            }}
          >
            <Snapshot label="Shares" value={shares.toLocaleString()} />
            <Snapshot label="Average entry" value={pct(average)} />
          </View>
        </View>

        <View
          style={{
            flex: 0.85,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: compact ? theme.spacing.md : theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
              alignItems: 'flex-end',
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="caption" tone="secondary">
                PORTFOLIO COST WEIGHT
              </VadText>
              <VadText variant="heading">{pct(portfolioWeight)}</VadText>
            </View>
            <VadText variant="caption" tone="tertiary">
              of recorded cost basis
            </VadText>
          </View>

          <View
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(portfolioWeight * 100),
            }}
            style={{
              height: 8,
              borderRadius: theme.radius.pill,
              overflow: 'hidden',
              backgroundColor: theme.colors.surfaceMuted,
            }}
          >
            <View
              style={{
                width: allocationWidth,
                height: '100%',
                backgroundColor: yes ? theme.colors.yes : theme.colors.no,
              }}
            />
          </View>

          <VadText variant="caption" tone="secondary">
            This is a cost-basis concentration measure across the positions
            currently returned by your portfolio.
          </VadText>
        </View>
      </View>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: theme.spacing.xxl,
        }}
      >
        <View style={{ flex: 1, width: '100%', gap: theme.spacing.sm }}>
          <View style={{ gap: 2 }}>
            <VadText variant="heading">Position details</VadText>
            <VadText variant="caption" tone="secondary">
              Backend-reported holding data.
            </VadText>
          </View>
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
            <Detail label="Outcome" value={position.outcome_code} />
            <Detail label="Shares" value={shares.toLocaleString()} />
            <Detail label="Average entry" value={pct(average)} />
            <Detail label="Cost basis" value={money(costBasis)} />
            <Detail label="Position status" value={position.status.replaceAll('_', ' ')} />
          </View>
        </View>

        <View style={{ flex: 0.8, width: '100%', gap: theme.spacing.sm }}>
          <View style={{ gap: 2 }}>
            <VadText variant="heading">Portfolio context</VadText>
            <VadText variant="caption" tone="secondary">
              Derived only from your current position rows.
            </VadText>
          </View>
          <View
            style={{
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: theme.colors.border,
              paddingVertical: theme.spacing.md,
              gap: theme.spacing.md,
            }}
          >
            <Snapshot label="Portfolio cost basis" value={money(portfolioCost)} />
            <Snapshot label="This position" value={money(costBasis)} />
            <Snapshot label="Cost weight" value={pct(portfolioWeight)} />
          </View>
        </View>
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          paddingVertical: theme.spacing.md,
          gap: 2,
        }}
      >
        <VadText variant="bodyStrong">What changes this position?</VadText>
        <VadText variant="caption" tone="secondary">
          Filled trades change your recorded shares and cost basis. Market
          resolution and settlement remain server-authoritative and are not
          inferred by this screen.
        </VadText>
      </View>
    </View>
  );
}

function Snapshot({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 110, flex: 1, gap: 2 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="heading" numberOfLines={1}>{value}</VadText>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 58,
        paddingVertical: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>
        {label}
      </VadText>
      <VadText
        variant="bodyStrong"
        style={{ flex: 1.2, textAlign: 'right' }}
      >
        {value}
      </VadText>
    </View>
  );
}
