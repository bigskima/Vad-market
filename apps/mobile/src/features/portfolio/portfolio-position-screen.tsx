import { useWindowDimensions, View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
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
  const wide = width >= 760;
  const data = useProductDataContext();

  const position = data.positions.find(
    (row) =>
      String(row.instrument_id) === instrumentId &&
      row.outcome_code === outcomeCode,
  );

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
  const portfolioWeight =
    portfolioCost > 0 ? costBasis / portfolioCost : 0;

  return (
    <View style={{ gap: theme.spacing.xl }}>
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
            {position.status}
          </VadText>
        </View>

        <VadText variant="title">{position.market_title}</VadText>
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
            paddingVertical: theme.spacing.lg,
            gap: theme.spacing.sm,
          }}
        >
          <VadText
            variant="caption"
            tone={yes ? 'yes' : 'no'}
          >
            COST BASIS
          </VadText>
          <VadText variant="display">{money(costBasis)}</VadText>
          <VadText variant="caption" tone="secondary">
            Capital recorded against this {position.outcome_code} position.
          </VadText>
        </View>

        <View
          style={{
            flex: 0.85,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.lg,
            gap: theme.spacing.lg,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.xl,
              flexWrap: 'wrap',
            }}
          >
            <Snapshot
              label="Shares"
              value={shares.toLocaleString()}
            />
            <Snapshot
              label="Average entry"
              value={pct(average)}
            />
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              paddingTop: theme.spacing.md,
              flexDirection: 'row',
              gap: theme.spacing.xl,
              flexWrap: 'wrap',
            }}
          >
            <Snapshot
              label="Portfolio weight"
              value={pct(portfolioWeight)}
            />
            <Snapshot
              label="Outcome"
              value={position.outcome_code}
            />
          </View>
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <VadText variant="heading">Position details</VadText>
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          }}
        >
          <Detail label="Outcome" value={position.outcome_code} />
          <Detail
            label="Shares"
            value={shares.toLocaleString()}
          />
          <Detail
            label="Average entry"
            value={pct(average)}
          />
          <Detail
            label="Cost basis"
            value={money(costBasis)}
          />
          <Detail
            label="Portfolio cost weight"
            value={pct(portfolioWeight)}
          />
          <Detail
            label="Position status"
            value={position.status}
          />
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
        <VadText variant="bodyStrong">How to read this position</VadText>
        <VadText variant="caption" tone="secondary">
          Portfolio weight compares this position&apos;s recorded cost basis
          with your other active positions. Market pricing, resolution, fees
          and settlement remain backend-authoritative.
        </VadText>
      </View>
    </View>
  );
}

function Snapshot({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 110, flex: 1, gap: 2 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="heading">{value}</VadText>
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
      <VadText
        variant="caption"
        tone="tertiary"
        style={{ flex: 1 }}
      >
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
