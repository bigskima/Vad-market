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
        <VadSkeleton height={112} />
        <VadSkeleton height={76} />
        <VadSkeleton height={76} />
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

  const created = Number(data.operations?.paymentCreated ?? 0);
  const pending = Number(
    data.operations?.paymentProviderPending ?? data.paymentQueue.length,
  );
  const failed = Number(data.operations?.paymentFailed ?? 0);
  const settledVisible = data.paymentQueue.filter(
    (row) => row.status === 'SETTLED' || Boolean(row.settled_at),
  ).length;
  const visibleTotal = data.paymentQueue.length;
  const visibleAmount = data.paymentQueue.reduce(
    (sum, row) => sum + Number(row.amount ?? 0),
    0,
  );
  const visibleFees = data.paymentQueue.reduce(
    (sum, row) => sum + Number(row.fee_amount ?? 0),
    0,
  );

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1.1,
            justifyContent: 'center',
            gap: theme.spacing.xs,
          }}
        >
          <VadText variant="label" tone="brand">PAYMENT OPERATIONS</VadText>
          <VadText variant="title">Money movement without ledger ambiguity.</VadText>
          <VadText tone="secondary">
            Payment intents explain external provider flow. Wallet and ledger
            balances remain the source of truth for financial state.
          </VadText>
        </View>

        <View
          style={{
            flex: wide ? 0.9 : undefined,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor:
              failed > 0
                ? theme.colors.danger
                : pending > 0
                  ? theme.colors.warning
                  : theme.colors.yes,
            paddingVertical: theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <VadText
            variant="caption"
            tone={failed > 0 ? 'danger' : pending > 0 ? 'warning' : 'yes'}
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
            <HealthFact label="Pending" value={String(pending)} tone={pending ? 'warning' : 'primary'} />
            <HealthFact label="Failed" value={String(failed)} tone={failed ? 'danger' : 'primary'} />
            <HealthFact label="Settled visible" value={String(settledVisible)} tone={settledVisible ? 'yes' : 'primary'} />
          </View>

          <VadText variant="caption" tone="tertiary">
            Summary counts may cover more records than the visible queue below.
          </VadText>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}
      >
        <AdminMetricCard label="Created" value={created} />
        <AdminMetricCard
          label="Provider pending"
          value={pending}
          tone={pending ? 'warning' : 'yes'}
        />
        <AdminMetricCard
          label="Failed"
          value={failed}
          tone={failed ? 'no' : 'yes'}
        />
        <AdminMetricCard
          label="Visible amount"
          value={money(visibleAmount)}
          tone="brand"
        />
        <AdminMetricCard label="Visible fees" value={money(visibleFees)} />
      </View>

      <OperationsSection
        title="Payment intent queue"
        description="Current provider-facing intents visible to this operations role."
        count={visibleTotal}
      >
        {visibleTotal ? (
          data.paymentQueue.map((row) => (
            <OperationsRow
              key={row.intent_public_id}
              title={`${humanOperation(row.operation)} · ${money(row.amount)}`}
              detail={
                `${String(row.provider_code ?? 'No provider')} · ` +
                `${row.asset_code} · net ${money(row.net_amount)}`
              }
              meta={
                `${new Date(row.created_at).toLocaleString()} · ` +
                `fee ${money(row.fee_amount)}` +
                (row.failure_code ? ` · ${row.failure_code.replaceAll('_', ' ')}` : '')
              }
              status={row.status}
              ready={row.status === 'SETTLED' || Boolean(row.settled_at)}
            />
          ))
        ) : (
          <View style={{ paddingVertical: theme.spacing.lg }}>
            <VadText variant="bodyStrong">No payment work is waiting.</VadText>
            <VadText variant="caption" tone="secondary">
              New provider-facing intents will appear here when visible to this
              operator role.
            </VadText>
          </View>
        )}
      </OperationsSection>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          paddingVertical: theme.spacing.md,
        }}
      >
        <Boundary
          title="Payment intent"
          body="Tracks provider-facing lifecycle, fees, failure state and settlement timestamp."
        />
        <Boundary
          title="Ledger"
          body="Remains authoritative for available, reserved, pending and settled balances."
        />
      </View>
    </View>
  );
}

function humanOperation(value: string) {
  const normalized = value.toUpperCase();
  if (normalized === 'DEPOSIT') return 'Deposit';
  if (normalized === 'WITHDRAWAL') return 'Withdrawal';
  if (normalized === 'REFUND') return 'Refund';
  return value.replaceAll('_', ' ');
}

function HealthFact({
  label,
  value,
  tone = 'primary',
}: {
  label: string;
  value: string;
  tone?: 'primary' | 'warning' | 'danger' | 'yes';
}) {
  return (
    <View style={{ minWidth: 82, gap: 2 }}>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <VadText variant="heading" tone={tone}>{value}</VadText>
    </View>
  );
}

function Boundary({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
      <VadText variant="bodyStrong">{title}</VadText>
      <VadText variant="caption" tone="secondary">{body}</VadText>
    </View>
  );
}
