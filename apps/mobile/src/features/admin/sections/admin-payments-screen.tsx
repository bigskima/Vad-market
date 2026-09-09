import { useWindowDimensions, View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AdminMetricCard } from '@/features/admin/dashboard/admin-metric-card';
import {
  OperationsRow,
  OperationsSection,
} from '@/features/admin/operations/operations-section';
import { money } from '@/features/markets/format';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminPaymentsScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const data = useAdminData();

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="50%" height={32} />
        <VadSkeleton height={90} />
        <VadSkeleton height={72} />
      </View>
    );
  }

  if (data.error) {
    return (
      <VadErrorState
        title="Payment operations unavailable"
        message={data.error}
        onRetry={() => void data.load()}
      />
    );
  }

  const pending = Number(
    data.operations?.paymentProviderPending ?? data.paymentQueue.length,
  );
  const failed = Number(data.operations?.paymentFailed ?? 0);
  const settledVisible = data.paymentQueue.filter(
    (row) => row.status === 'SETTLED',
  ).length;

  const visibleTotal = data.paymentQueue.length;

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            gap: theme.spacing.xs,
          }}
        >
          <VadText variant="label" tone="brand">PAYMENTS</VadText>
          <VadText variant="title">Money movement operations.</VadText>
          <VadText tone="secondary">
            Review payment-intent state while the ledger remains the financial
            source of truth for available, reserved and settled balances.
          </VadText>
        </View>

        <View
          style={{
            flex: wide ? 0.9 : undefined,
            borderRadius: theme.radius.xl,
            backgroundColor:
              failed > 0
                ? theme.colors.noSoft
                : pending > 0
                  ? theme.colors.warningSoft
                  : theme.colors.yesSoft,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <VadText
            variant="caption"
            tone={failed > 0 ? 'no' : pending > 0 ? 'warning' : 'yes'}
          >
            PAYMENT HEALTH
          </VadText>

          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.xl,
              flexWrap: 'wrap',
            }}
          >
            <HealthFact label="Pending" value={String(pending)} />
            <HealthFact label="Failed" value={String(failed)} />
            <HealthFact label="Settled" value={String(settledVisible)} />
          </View>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}
      >
        <AdminMetricCard
          label="Pending"
          value={pending}
          tone={pending ? 'warning' : 'yes'}
        />
        <AdminMetricCard
          label="Failed"
          value={failed}
          tone={failed ? 'no' : 'yes'}
        />
        <AdminMetricCard
          label="Settled visible"
          value={settledVisible}
          tone="yes"
        />
        <AdminMetricCard
          label="Visible intents"
          value={visibleTotal}
        />
      </View>

      <OperationsSection
        title="Payment intents"
        description="Provider and ledger state for visible payment operations."
        count={visibleTotal}
      >
        {visibleTotal ? (
          data.paymentQueue.map((row) => (
            <OperationsRow
              key={row.intent_public_id}
              title={row.operation + ' · ' + money(row.amount)}
              detail={
                String(row.provider_code ?? 'No provider') +
                ' · fee ' +
                money(row.fee_amount)
              }
              status={row.status}
              ready={row.status === 'SETTLED'}
            />
          ))
        ) : (
          <View style={{ paddingVertical: 18 }}>
            <VadText tone="secondary">No payment intents in this queue.</VadText>
          </View>
        )}
      </OperationsSection>
    </View>
  );
}

function HealthFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 82, gap: 2 }}>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <VadText variant="heading">{value}</VadText>
    </View>
  );
}
