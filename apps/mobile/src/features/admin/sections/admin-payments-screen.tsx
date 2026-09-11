import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
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
import {
  hasAdminPermission,
  requestAdminRefund,
} from '@/services/admin-control-api';
import type { PaymentQueueRow } from '@/services/operations-admin-api';

export function AdminPaymentsScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const data = useAdminData();
  const canRefund = hasAdminPermission(data.access, 'payments.refund');
  const [selected, setSelected] = useState<PaymentQueueRow | null>(null);
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
  const visibleQuotedFees = data.paymentQueue.reduce(
    (sum, row) => sum + Number(row.fee_amount ?? 0),
    0,
  );

  function openRefund(row: PaymentQueueRow) {
    if (!canRefund || !isRefundEligible(row)) return;
    setSelected(row);
    setReason('');
    setActionError(null);
    setSuccessMessage(null);
  }

  async function requestRefund() {
    if (!selected || reason.trim().length < 3) return;

    setWorking(true);
    setActionError(null);
    try {
      const refundIntentId = await requestAdminRefund(
        selected.intent_public_id,
        reason,
      );
      setSelected(null);
      setReason('');
      setSuccessMessage(
        `Refund request ${refundIntentId} was created. Its status will update as the refund is processed.`,
      );
      await data.refresh();
    } catch (reasonValue) {
      setActionError(
        reasonValue instanceof Error
          ? reasonValue.message
          : 'The refund request could not be created.',
      );
    } finally {
      setWorking(false);
    }
  }

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
          <VadText variant="title">Track money movement clearly.</VadText>
          <VadText tone="secondary">
            Review deposits, withdrawals and refunds alongside their provider status. Wallet balances remain the final financial record, while recognized VAD revenue is tracked separately.
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
            <HealthFact label="Completed visible" value={String(settledVisible)} tone={settledVisible ? 'yes' : 'primary'} />
          </View>

          <VadText variant="caption" tone="tertiary">
            Summary counts may cover more records than the visible queue below.
          </VadText>
        </View>
      </View>

      {successMessage ? (
        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.yes,
            backgroundColor: theme.colors.yesSoft,
            padding: theme.spacing.md,
            gap: theme.spacing.xs,
          }}
        >
          <VadText variant="caption" tone="yes">REFUND REQUEST CREATED</VadText>
          <VadText variant="caption" tone="secondary">{successMessage}</VadText>
          <VadButton
            label="Dismiss"
            variant="ghost"
            size="small"
            fullWidth={false}
            onPress={() => setSuccessMessage(null)}
          />
        </View>
      ) : null}

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
        <AdminMetricCard
          label="Quoted fees"
          value={money(visibleQuotedFees)}
          detail="Not recognized revenue"
        />
      </View>

      <OperationsSection
        title="Payment queue"
        description={
          canRefund
            ? 'Completed deposits can enter an audited refund workflow. Other payments remain review-only.'
            : 'Current payments available to this operations role.'
        }
        count={visibleTotal}
      >
        {visibleTotal ? (
          data.paymentQueue.map((row) => {
            const refundEligible = canRefund && isRefundEligible(row);
            return (
              <OperationsRow
                key={row.intent_public_id}
                title={`${humanOperation(row.operation)} · ${money(row.amount)}`}
                detail={
                  `${String(row.provider_code ?? 'No provider')} · ` +
                  `${row.asset_code} · net ${money(row.net_amount)}`
                }
                meta={
                  `${new Date(row.created_at).toLocaleString()} · ` +
                  `quoted fee ${money(row.fee_amount)}` +
                  (row.failure_code ? ' · Needs investigation' : '')
                }
                status={paymentStatusLabel(row)}
                ready={row.status === 'SETTLED' || Boolean(row.settled_at)}
                actionLabel={refundEligible ? 'Refund' : undefined}
                onPress={refundEligible ? () => openRefund(row) : undefined}
              />
            );
          })
        ) : (
          <View style={{ paddingVertical: theme.spacing.lg }}>
            <VadText variant="bodyStrong">No payment work is waiting.</VadText>
            <VadText variant="caption" tone="secondary">
              New payments will appear here when they are available to this operations role.
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
          title="Payment status"
          body="Tracks the payment lifecycle, quoted fees and completion state."
        />
        <Boundary
          title="VAD revenue"
          body="Counts recognized fee income after it is posted. A quoted or pending payment fee is not revenue yet."
        />
        <Boundary
          title="Platform balance"
          body="Available, committed, collateral, pending and clearing balances remain separate from VAD revenue."
        />
        <Boundary
          title="Refund request"
          body="Creates a linked refund request. It does not show money as returned before the refund completes."
        />
      </View>

      <VadBottomSheet
        visible={Boolean(selected)}
        title="Start refund request?"
        onClose={() => {
          if (!working) setSelected(null);
        }}
      >
        {selected ? (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: theme.spacing.xs }}>
              <VadText variant="label" tone="brand">COMPLETED DEPOSIT</VadText>
              <VadText variant="title">{money(selected.amount)}</VadText>
              <VadText variant="caption" tone="secondary">
                {selected.asset_code} · {selected.provider_code ?? 'Provider'}
              </VadText>
              <VadText variant="caption" tone="tertiary" selectable>
                {selected.intent_public_id}
              </VadText>
            </View>

            <View
              style={{
                borderLeftWidth: 3,
                borderLeftColor: theme.colors.warning,
                backgroundColor: theme.colors.warningSoft,
                padding: theme.spacing.md,
                gap: 2,
              }}
            >
              <VadText variant="caption" tone="warning">REFUND REQUEST</VadText>
              <VadText variant="caption" tone="secondary">
                This creates a refund linked to the original deposit. The payment remains unchanged until the refund is successfully processed.
              </VadText>
            </View>

            <VadInput
              label="Refund reason"
              value={reason}
              onChangeText={(value) => {
                setReason(value);
                setActionError(null);
              }}
              placeholder="Why should this completed deposit be refunded?"
              multiline
              error={
                reason.length > 0 && reason.trim().length < 3
                  ? 'Enter at least 3 characters.'
                  : undefined
              }
            />

            {actionError ? (
              <VadErrorState
                title="Refund request failed"
                message={actionError}
              />
            ) : null}

            <VadButton
              label="Create refund request"
              loading={working}
              disabled={reason.trim().length < 3}
              onPress={() => void requestRefund()}
            />
            <VadButton
              label="Cancel"
              variant="secondary"
              disabled={working}
              onPress={() => setSelected(null)}
            />
          </View>
        ) : null}
      </VadBottomSheet>
    </View>
  );
}

function isRefundEligible(row: PaymentQueueRow) {
  return (
    row.operation.toUpperCase() === 'DEPOSIT' &&
    (row.status.toUpperCase() === 'SETTLED' || Boolean(row.settled_at))
  );
}

function paymentStatusLabel(row: PaymentQueueRow) {
  if (row.settled_at || ['SETTLED', 'COMPLETED', 'SUCCESS', 'SUCCEEDED'].includes(row.status.toUpperCase())) return 'COMPLETED';
  if (row.failure_code || ['FAILED', 'REJECTED', 'CANCELLED', 'EXPIRED'].some((value) => row.status.toUpperCase().includes(value))) return 'NEEDS ATTENTION';
  return 'PROCESSING';
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
