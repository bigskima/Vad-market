import { View } from 'react-native';

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

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">PAYMENTS</VadText>
        <VadText variant="title">Money movement operations.</VadText>
        <VadText tone="secondary">
          Review deposit and withdrawal intents while the ledger remains the
          financial source of truth.
        </VadText>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
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
      </View>

      <OperationsSection
        title="Payment intents"
        description="Provider and ledger state for visible payment operations."
        count={data.paymentQueue.length}
      >
        {data.paymentQueue.length ? (
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
