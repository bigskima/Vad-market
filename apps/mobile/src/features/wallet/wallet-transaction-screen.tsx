import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money } from '@/features/markets/format';
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
          : 'Transaction status could not be refreshed.',
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
        body="This payment record could not be found in your recent wallet activity."
      />
    );
  }

  const incoming = intent.operation === 'DEPOSIT';
  const settled = Boolean(intent.settled_at);
  const failed = Boolean(intent.failure_code);
  const processing = !settled && !failed;
  const statusTone = settled ? 'yes' : failed ? 'danger' : 'warning';
  const statusTitle = settled
    ? 'Payment settled'
    : failed
      ? 'Payment needs attention'
      : 'Payment is processing';
  const netDifference = Number(intent.amount) - Number(intent.net_amount);

  return (
    <View style={{ gap: density.compact ? theme.spacing.lg : theme.spacing.xl }}>
      {error ? (
        <VadErrorState
          title="Transaction refresh failed"
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
            {money(intent.amount)}
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
          label={intent.status.replaceAll('_', ' ')}
          tone={settled ? 'yes' : failed ? 'no' : 'warning'}
        />
        <VadText variant="heading">{statusTitle}</VadText>
        <VadText variant="caption" tone="secondary">
          {settled
            ? 'The provider flow reached settlement. Your ledger balance remains the final source of truth.'
            : failed
              ? 'The payment route reported an issue. Review the failure detail below before retrying.'
              : 'The request exists and is waiting for the external payment route to reach a final state.'}
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
              <VadText variant="caption" tone="secondary">Values returned by this payment intent.</VadText>
            </View>
            <View>
              <Detail label="Gross amount" value={money(intent.amount)} />
              <Detail label="Fee" value={money(intent.fee_amount)} />
              <Detail label="Net amount" value={money(intent.net_amount)} emphasized />
              <Detail label="Fee difference" value={money(netDifference)} />
              <Detail label="Asset" value={intent.asset_code} />
            </View>
          </VadCard>

          <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
            <View style={{ gap: 1 }}>
              <VadText variant="heading">Transaction record</VadText>
              <VadText variant="caption" tone="secondary">Keep this reference when investigating an issue.</VadText>
            </View>
            <View>
              <Detail label="Reference" value={intent.intent_public_id} selectable />
              <Detail label="Payment route" value={intent.provider_configured ? 'Configured' : 'Not configured'} />
              <Detail label="Created" value={new Date(intent.created_at).toLocaleString()} />
              <Detail label="Settled" value={intent.settled_at ? new Date(intent.settled_at).toLocaleString() : 'Not settled yet'} />
            </View>
          </VadCard>
        </View>

        <View style={{ flex: 0.9, width: '100%', gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
          <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
            <View style={{ gap: 1 }}>
              <VadText variant="heading">Payment progress</VadText>
              <VadText variant="caption" tone="secondary">External payment status, not a replacement for ledger state.</VadText>
            </View>
            <View>
              <StatusStep label="Intent created" detail={new Date(intent.created_at).toLocaleString()} state="complete" />
              <StatusStep
                label="Provider processing"
                detail={failed ? 'Provider processing ended with an issue.' : settled ? 'Provider processing completed.' : 'Waiting for the payment route to complete.'}
                state={failed ? 'failed' : settled ? 'complete' : 'active'}
              />
              <StatusStep
                label="Settlement"
                detail={intent.settled_at ? new Date(intent.settled_at).toLocaleString() : failed ? 'Not settled because this intent did not complete.' : 'Waiting for a final provider state.'}
                state={settled ? 'complete' : failed ? 'failed' : 'waiting'}
              />
            </View>
          </VadCard>

          {intent.failure_code ? (
            <VadCard variant="raised" style={{ borderColor: theme.colors.danger, gap: 4 }}>
              <VadText variant="caption" tone="danger">PAYMENT ISSUE</VadText>
              <VadText variant="bodyStrong">{intent.failure_code.replaceAll('_', ' ')}</VadText>
              <VadText variant="caption" tone="secondary">
                Refresh after the underlying issue is resolved. A retry is not successful until a new authoritative state appears.
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
        Payment intent state explains the external flow. Ledger balances remain authoritative for available, reserved and settled funds.
      </VadText>
    </View>
  );
}

function operationLabel(operation: PaymentIntentRow['operation']) {
  if (operation === 'DEPOSIT') return 'Deposit';
  if (operation === 'WITHDRAWAL') return 'Withdrawal';
  return 'Refund';
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
