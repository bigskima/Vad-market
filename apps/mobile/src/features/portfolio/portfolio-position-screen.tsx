import { View } from 'react-native';

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
            alignSelf: 'flex-start',
            borderRadius: theme.radius.pill,
            backgroundColor: yes ? theme.colors.yesSoft : theme.colors.noSoft,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xs,
          }}
        >
          <VadText variant="label" tone={yes ? 'yes' : 'no'}>
            {position.outcome_code}
          </VadText>
        </View>

        <VadText variant="title">{position.market_title}</VadText>
        <VadText variant="caption" tone="secondary">{position.status}</VadText>
      </View>

      <View
        style={{
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.surfaceRaised,
          padding: theme.spacing.xl,
          gap: theme.spacing.xs,
        }}
      >
        <VadText variant="caption" tone="secondary">Cost basis</VadText>
        <VadText variant="display">{money(position.total_cost_basis)}</VadText>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        <Detail label="Shares" value={Number(position.quantity).toLocaleString()} />
        <Detail label="Average entry" value={pct(position.average_price)} />
        <Detail label="Outcome" value={position.outcome_code} />
        <Detail label="Position status" value={position.status} />
      </View>

      <View
        style={{
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.brandSoft,
          padding: theme.spacing.md,
        }}
      >
        <VadText variant="caption" tone="brand">
          Current market price and settlement remain governed by the live market and ledger. This screen only reflects your recorded position.
        </VadText>
      </View>
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
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ flex: 1, textAlign: 'right' }}>{value}</VadText>
    </View>
  );
}
