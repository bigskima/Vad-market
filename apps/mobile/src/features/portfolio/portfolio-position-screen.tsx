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
          <View
            style={{
              alignSelf: 'flex-start',
              borderRadius: theme.radius.pill,
              backgroundColor: yes
                ? theme.colors.yesSoft
                : theme.colors.noSoft,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
            }}
          >
            <VadText variant="label" tone={yes ? 'yes' : 'no'}>
              {position.outcome_code}
            </VadText>
          </View>

          <VadText variant="caption" tone="tertiary">
            {position.status}
          </VadText>
        </View>

        <VadText variant="title">{position.market_title}</VadText>
      </View>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'stretch',
          gap: theme.spacing.md,
        }}
      >
        <View
          style={{
            flex: 1.2,
            borderRadius: theme.radius.xl,
            backgroundColor: yes
              ? theme.colors.yesSoft
              : theme.colors.noSoft,
            padding: theme.spacing.xl,
            gap: theme.spacing.sm,
          }}
        >
          <VadText
            variant="caption"
            tone={yes ? 'yes' : 'no'}
          >
            COST BASIS
          </VadText>
          <VadText variant="display">
            {money(position.total_cost_basis)}
          </VadText>
          <VadText variant="caption" tone="secondary">
            Capital recorded against this {position.outcome_code} position.
          </VadText>
        </View>

        <View
          style={{
            flex: 0.8,
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: theme.spacing.lg,
            gap: theme.spacing.lg,
            justifyContent: 'center',
          }}
        >
          <Snapshot
            label="Shares"
            value={Number(position.quantity).toLocaleString()}
          />
          <Snapshot
            label="Average entry"
            value={pct(position.average_price)}
          />
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
          <Detail
            label="Outcome"
            value={position.outcome_code}
          />
          <Detail
            label="Shares"
            value={Number(position.quantity).toLocaleString()}
          />
          <Detail
            label="Average entry"
            value={pct(position.average_price)}
          />
          <Detail
            label="Cost basis"
            value={money(position.total_cost_basis)}
          />
          <Detail
            label="Position status"
            value={position.status}
          />
        </View>
      </View>

      <View
        style={{
          borderLeftWidth: 3,
          borderLeftColor: theme.colors.brandPrimary,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.brandSoft,
          padding: theme.spacing.md,
        }}
      >
        <VadText variant="caption" tone="brand">
          This screen reflects the position recorded by VAD. Market price,
          resolution and settlement remain governed by the live market and
          authoritative ledger.
        </VadText>
      </View>
    </View>
  );
}

function Snapshot({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
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
        style={{ flex: 1, textAlign: 'right' }}
      >
        {value}
      </VadText>
    </View>
  );
}
