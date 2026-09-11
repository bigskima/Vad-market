import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { assetMoney } from '@/features/markets/format';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getMyPaymentIntents,
  type PaymentIntentRow,
} from '@/services/payment-api';

export function WalletTransactionScreen({ intentId }: { intentId: string }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 840;
  const [intent, setIntent] = useState<PaymentIntentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);

    try {
      const rows = await getMyPaymentIntents(100);
      setIntent(rows.find((row) => row.intent_public_id === intentId) ?? null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'We could not refresh this transaction right now. Please try again.',
      );
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, [intentId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (loading) {
    return (
      <View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
        <VadSkeleton width="48%" height={26} />
        <VadSkeleton height={density.compact ? 112 : 132} radius={theme.radius.lg} />
        <VadSkeleton height={density.compact ? 58 : 66} radius={theme.radius.lg} />
        <VadSkeleton height={density.compact ? 58 : 66} radius={theme.radius.lg} />
      </View>
    );
  }

  if (!intent && error) {
    return (
      <VadErrorState
        title="Transaction could not be loaded"
        message={error}
        onRetry={() => {
          setLoading(true);
          void load();
        }}
      />
    );
  }

  if (!intent) {
    return (
      <VadEmptyState
        title="Transaction unavailable"
        body="This payment could not be found in your recent wallet activity."
      />
    );
  }

  const incoming = intent.operation === 'DEPOSIT';
  const settled = Boolean(intent.settled_at);
  const failed = Boolean(intent.failure_code) || paymentStatusKind(intent.status) === 'failed';
  const processing = !settled && !failed;
  const statusTitle = settled
    ? 'Payment completed'
    : failed
      ? 'Payment needs attention'
      : 'Payment is processing';
  const netDifference = Number(intent.amount) - Number(intent.net_amount);
  const amount = (value: unknown) => assetMoney(value, intent.asset_code);

  return (
    <View style={{ gap: density.compact ? theme.spacing.lg : theme.spacing.xl }}>
      {error ? (
        <VadErrorState
          title="Could not refresh transaction"
          message={error}
          onRetry={() => void load(true)}
        />
      ) : null}

      <View
        style={{
          flexDirection: density.width >= 620 ? 'row' : 'column',
          justifyContent: 'space-between',
          alignItems: density.width >= 620 ? 'flex-end' : 'stretch',
          gap: density.compact ? theme.spacing.sm : theme.spacing.md,
        }}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <VadChip label={operationLabel(intent.operation).toUpperCase()} tone={incoming ? 'yes' : 'brand'} />
            <VadChip label={intent.asset_code} />
          </View>
          <VadText variant={density.compact ? 'title' : 'display'} numberOfLines={1} adjustsFontSizeToFit>
            {amount(intent.amount)}
          </VadText>
          <VadText variant="caption" tone="secondary">
            {new Date(intent.created_at).toLocaleString()}
          </VadText>
        </View>

        <VadButton
          label="Refresh status"
          variant="secondary"
          size="small"
          fullWidth={false}
          loading={refreshing}
          onPress={() => void load(true)}
        />
      </View>

      <VadCard
        variant="raised"
        accessibilityRole="summary"
        style={{
          borderColor: settled
            ? theme.colors.yes
            : failed
              ? theme.colors.danger
              : theme.colors.warning,
          gap: density.compact ? 6 : theme.spacing.xs,
        }}
      >
        <VadChip
          label={paymentStatusLabel(intent.status, settled, failed)}
          tone={settled ? 'yes' : failed ? 'no' : 'warning'}
        />
        <VadText variant="heading">{statusTitle}</VadText>
        <VadText variant="caption" tone="secondary">
          {settled
            ? 'This payment has been completed and your wallet reflects its final status.'
            : failed
              ? 'This payment did not complete successfully. You can refresh the status or start a new request when appropriate.'
              : 'Your payment request is still being processed. You can leave this screen and check again later.'}
        </VadText>
      </VadCard>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: density.compact ? theme.spacing.md : theme.spacing.lg,
        }}
      >
        <View style={{ flex: 1.1, width: '100%', gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
          <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
            <View style={{ gap: 1 }}>
              <VadText variant="heading">Amount breakdown</VadText>
              <VadText variant="caption" tone="secondary">A summary of the amounts for this payment.</VadText>
            </View>
            <View>
              <Detail label="Gross amount" value={amount(intent.amount)} />
              <Detail label="Fee" value={amount(intent.fee_amount)} />
              <Detail label="Net amount" value={amount(intent.net_amount)} emphasized />
              <Detail label="Fee difference" value={amount(netDifference)} />
              <Detail label="Currency" value={intent.asset_code} />
            </View>
          </VadCard>

          <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
            <View style={{ gap: 1 }}>
              <VadText variant="heading">Transaction details</VadText>
              <VadText variant="caption" tone="secondary">Keep this reference if you need help with this payment.</VadText>
            </View>
            <View>
              <Detail label="Reference" value={intent.intent_public_id} selectable />
              <Detail label="Created" value={new Date(intent.created_at).toLocaleString()} />
              <Detail label="Completed" value={intent.settled_at ? new Date(intent.settled_at).toLocaleString() : 'Not completed yet'} />
            </View>
          </VadCard>
        </View>

        <View style={{ flex: 0.9, width: '100%', gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
          <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
            <View style={{ gap: 1 }}>
              <VadText variant="heading">Payment progress</VadText>
              <VadText variant="caption" tone="secondary">Follow the current progress of this payment request.</VadText>
            </View>
            <View>
              <StatusStep label="Request created" detail={new Date(intent.created_at).toLocaleString()} state="complete" />
              <StatusStep
                label="Processing"
                detail={failed ? 'Processing ended with an issue.' : settled ? 'Processing completed.' : 'Your payment is still being processed.'}
                state={failed ? 'failed' : settled ? 'complete' : 'active'}
              />
              <StatusStep
                label="Completed"
                detail={intent.settled_at ? new Date(intent.settled_at).toLocaleString() : failed ? 'This payment was not completed.' : 'Waiting for the payment to finish.'}
                state={settled ? 'complete' : failed ? 'failed' : 'waiting'}
              />
            </View>
          </VadCard>

          {failed ? (
            <VadCard variant="raised" style={{ borderColor: theme.colors.danger, gap: 4 }}>
              <VadText variant="caption" tone="danger">PAYMENT ISSUE</VadText>
              <VadText variant="bodyStrong">This payment could not be completed.</VadText>
              <VadText variant="caption" tone="secondary">
                Refresh the status first. If the issue continues, start a new request or contact support with the transaction reference.
              </VadText>
            </VadCard>
          ) : processing ? (
            <VadCard variant="muted" style={{ gap: 2 }}>
              <VadText variant="bodyStrong">Still processing</VadText>
              <VadText variant="caption" tone="secondary">You can leave this screen and return from Wallet activity later.</VadText>
            </VadCard>
          ) : null}
        </View>
      </View>

      <VadText variant="caption" tone="tertiary">
        Your wallet balance is the final record of funds available to use or withdraw.
      </VadText>
    </View>
  );
}

function operationLabel(operation: PaymentIntentRow['operation']) {
  if (operation === 'DEPOSIT') return 'Deposit';
  if (operation === 'WITHDRAWAL') return 'Withdrawal';
  return 'Refund';
}

function paymentStatusKind(status: string): 'processing' | 'settled' | 'failed' {
  const normalized = status.toUpperCase();
  if (normalized === 'SETTLED' || normalized === 'COMPLETED' || normalized === 'SUCCESS') return 'settled';
  if (normalized.includes('FAIL') || normalized.includes('REJECT') || normalized.includes('CANCEL') || normalized.includes('EXPIRE')) return 'failed';
  return 'processing';
}

function paymentStatusLabel(status: string, settled: boolean, failed: boolean) {
  if (settled) return 'COMPLETED';
  if (failed) return 'NEEDS ATTENTION';
  const normalized = status.toUpperCase();
  if (normalized.includes('PENDING') || normalized.includes('PROCESS') || normalized.includes('CREATED') || normalized.includes('INIT')) return 'PROCESSING';
  return 'IN PROGRESS';
}

function StatusStep({ label, detail, state }: { label: string; detail: string; state: 'complete' | 'active' | 'waiting' | 'failed' }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const tone = state === 'complete' ? 'yes' : state === 'active' ? 'brand' : state === 'failed' ? 'danger' : 'tertiary';

  return (
    <View style={{ minHeight: density.compact ? 50 : 56, paddingVertical: density.compact ? 7 : theme.spacing.sm, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <View
        style={{
          width: density.compact ? 26 : 28,
          height: density.compact ? 26 : 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: state === 'complete' ? theme.colors.yesSoft : state === 'active' ? theme.colors.brandSoft : state === 'failed' ? theme.colors.noSoft : theme.colors.surfaceRaised,
        }}
      >
        <VadText variant="caption" tone={tone}>
          {state === 'complete' ? '✓' : state === 'active' ? '•' : state === 'failed' ? '!' : '–'}
        </VadText>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <VadText variant="bodyStrong">{label}</VadText>
        <VadText variant="caption" tone="secondary">{detail}</VadText>
      </View>
    </View>
  );
}

function Detail({ label, value, selectable = false, emphasized = false }: { label: string; value: string; selectable?: boolean; emphasized?: boolean }) {
  const theme = useVadTheme();
  const density = useProductDensity();

  return (
    <View style={{ minHeight: density.compact ? 42 : 48, paddingVertical: density.compact ? 6 : 8, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>{label}</VadText>
      <VadText
        variant={emphasized ? 'heading' : 'bodyStrong'}
        tone={emphasized ? 'brand' : 'primary'}
        style={{ flex: 1.6, textAlign: 'right' }}
        numberOfLines={selectable ? undefined : 2}
        selectable={selectable}
      >
        {value}
      </VadText>
    </View>
  );
}
