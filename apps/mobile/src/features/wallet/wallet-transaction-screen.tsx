import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadProgressiveSection } from '@/components/ui/vad-progressive-section';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { assetMoney } from '@/features/markets/format';
import { formatRelativeTimestamp } from '@/features/markets/market-state';
import { useLiveNow } from '@/hooks/use-live-now';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getMyPaymentIntents,
  type PaymentIntentRow,
} from '@/services/payment-api';

export function WalletTransactionScreen({ intentId }: { intentId: string }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const now = useLiveNow();
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
  const createdRelative = formatRelativeTimestamp(intent.created_at, now) ?? 'recently';
  const settledRelative = formatRelativeTimestamp(intent.settled_at, now);
  const createdExact = new Date(intent.created_at).toLocaleString();
  const settledExact = intent.settled_at ? new Date(intent.settled_at).toLocaleString() : null;

  return (
    <View style={{ gap: density.sectionGap }}>
      {error ? (
        <VadErrorState
          title="Could not refresh transaction"
          message={error}
          onRetry={() => void load(true)}
        />
      ) : null}

      <VadCard variant="brand" style={{ gap: theme.spacing.md, padding: density.phone ? theme.spacing.lg : theme.spacing.xl, overflow: 'hidden' }}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 170,
            height: 170,
            borderRadius: 85,
            right: -66,
            top: -82,
            backgroundColor: theme.colors.surface,
            opacity: theme.mode === 'dark' ? 0.06 : 0.42,
          }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <VadChip label={operationLabel(intent.operation).toUpperCase()} tone={incoming ? 'yes' : 'brand'} />
          <VadChip label={intent.asset_code} />
          <VadChip label={paymentStatusLabel(intent.status, settled, failed)} tone={settled ? 'yes' : failed ? 'no' : 'warning'} />
          <VadChip label={(settledRelative ?? createdRelative).toUpperCase()} />
        </View>
        <View style={{ gap: 3 }}>
          <VadText variant="caption" tone="tertiary">TRANSACTION AMOUNT</VadText>
          <VadText variant={density.phone ? 'title' : 'display'} numberOfLines={1} adjustsFontSizeToFit>
            {amount(intent.amount)}
          </VadText>
          <VadText variant="caption" tone="secondary">
            {settled && settledRelative ? `Completed ${settledRelative}` : `Created ${createdRelative}`}
          </VadText>
        </View>
        <View style={{ flexDirection: density.phone ? 'column' : 'row', alignItems: density.phone ? 'stretch' : 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <VadText variant="bodyStrong">{statusTitle}</VadText>
            <VadText variant="caption" tone="secondary">
              {settled
                ? 'The payment is complete and your wallet reflects its final status.'
                : failed
                  ? 'Refresh once before retrying. If the issue continues, keep the reference below for support.'
                  : `Processing since ${createdRelative}. You can safely leave this screen and return from Wallet activity.`}
            </VadText>
          </View>
          <VadButton
            label="Refresh status"
            variant="secondary"
            size="small"
            fullWidth={density.phone}
            loading={refreshing}
            onPress={() => void load(true)}
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
          <VadText variant="bodyStrong">Still processing · {createdRelative}</VadText>
          <VadText variant="caption" tone="secondary">No need to keep this page open. You can return from Wallet activity later.</VadText>
        </VadCard>
      ) : null}

      <VadProgressiveSection
        title="Payment progress"
        eyebrow="STATUS TIMELINE"
        description="See where this request is in its payment lifecycle."
        icon="activity"
        defaultExpanded={!settled}
        summary={<VadText variant="caption" tone={settled ? 'yes' : failed ? 'danger' : 'warning'}>{statusTitle}</VadText>}
      >
        <View>
          <StatusStep label="Request created" detail={`${createdRelative} · ${createdExact}`} state="complete" />
          <StatusStep
            label="Processing"
            detail={failed ? 'Processing ended with an issue.' : settled ? 'Processing completed.' : `Processing for ${createdRelative.replace(' ago', '')}.`}
            state={failed ? 'failed' : settled ? 'complete' : 'active'}
          />
          <StatusStep
            label="Completed"
            detail={settledExact ? `${settledRelative ?? 'Completed'} · ${settledExact}` : failed ? 'This payment was not completed.' : 'Waiting for the payment to finish.'}
            state={settled ? 'complete' : failed ? 'failed' : 'waiting'}
          />
        </View>
      </VadProgressiveSection>

      <VadProgressiveSection
        title="Amount breakdown"
        eyebrow="MONEY DETAILS"
        description="Gross amount, fee and final net amount."
        icon="wallet"
        summary={<VadText variant="caption" tone="tertiary">Net {amount(intent.net_amount)} · Fee {amount(intent.fee_amount)}</VadText>}
      >
        <View>
          <Detail label="Gross amount" value={amount(intent.amount)} />
          <Detail label="Fee" value={amount(intent.fee_amount)} />
          <Detail label="Net amount" value={amount(intent.net_amount)} emphasized />
          <Detail label="Fee difference" value={amount(netDifference)} />
          <Detail label="Currency" value={intent.asset_code} />
        </View>
      </VadProgressiveSection>

      <VadProgressiveSection
        title="Reference and timestamps"
        eyebrow="TECHNICAL DETAILS"
        description="Open this only when you need a reference for support or reconciliation."
        icon="account"
        summary={<VadText variant="caption" tone="tertiary" numberOfLines={1}>{intent.intent_public_id}</VadText>}
      >
        <View>
          <Detail label="Reference" value={intent.intent_public_id} selectable />
          <Detail label="Created" value={`${createdExact} · ${createdRelative}`} />
          <Detail label="Completed" value={settledExact ? `${settledExact} · ${settledRelative ?? 'completed'}` : 'Not completed yet'} />
        </View>
      </VadProgressiveSection>

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
