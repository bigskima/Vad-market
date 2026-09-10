import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getMyPaymentIntents,
  type PaymentIntentRow,
} from '@/services/payment-api';

export function WalletTransactionScreen({
  intentId,
}: {
  intentId: string;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 840;
  const compact = width < 380;
  const [intent, setIntent] = useState<PaymentIntentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);

    try {
      const rows = await getMyPaymentIntents(100);
      setIntent(
        rows.find((row) => row.intent_public_id === intentId) ?? null,
      );
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
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="52%" height={30} />
        <VadSkeleton height={170} radius={theme.radius.xl} />
        <VadSkeleton height={70} />
        <VadSkeleton height={70} />
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
    <View style={{ gap: theme.spacing.xxl }}>
      {error ? (
        <VadErrorState
          title="Transaction refresh failed"
          message={error}
          onRetry={() => void load(true)}
        />
      ) : null}

      <View
        style={{
          flexDirection: width >= 620 ? 'row' : 'column',
          justifyContent: 'space-between',
          alignItems: width >= 620 ? 'flex-end' : 'stretch',
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone={incoming ? 'yes' : 'brand'}>
            {operationLabel(intent.operation).toUpperCase()}
          </VadText>
          <VadText variant="display" numberOfLines={1} adjustsFontSizeToFit>
            {money(intent.amount)}
          </VadText>
          <VadText variant="caption" tone="secondary">
            Created {new Date(intent.created_at).toLocaleString()}
          </VadText>
        </View>

        <VadButton
          label="Refresh status"
          variant="secondary"
          size="small"
          fullWidth={width < 520}
          loading={refreshing}
          onPress={() => void load(true)}
        />
      </View>

      <View
        accessibilityRole="summary"
        style={{
          borderLeftWidth: 3,
          borderLeftColor:
            settled
              ? theme.colors.yes
              : failed
                ? theme.colors.danger
                : theme.colors.warning,
          backgroundColor:
            settled
              ? theme.colors.yesSoft
              : failed
                ? theme.colors.noSoft
                : theme.colors.warningSoft,
          padding: compact ? theme.spacing.md : theme.spacing.lg,
          gap: theme.spacing.xs,
        }}
      >
        <VadText variant="label" tone={statusTone}>
          {intent.status.replaceAll('_', ' ')}
        </VadText>
        <VadText variant="heading">{statusTitle}</VadText>
        <VadText variant="caption" tone="secondary">
          {settled
            ? 'The provider flow reached settlement. Your ledger balance remains the final source of truth.'
            : failed
              ? 'The payment route reported an issue. Review the failure detail below before retrying elsewhere.'
              : 'The intent exists and is waiting for the external payment route to reach a final state.'}
        </VadText>
      </View>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: theme.spacing.xxl,
        }}
      >
        <View style={{ flex: 1.1, width: '100%', gap: theme.spacing.xl }}>
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ gap: 2 }}>
              <VadText variant="heading">Amount breakdown</VadText>
              <VadText variant="caption" tone="secondary">
                Values returned by the payment intent.
              </VadText>
            </View>

            <View
              style={{
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Detail label="Gross amount" value={money(intent.amount)} />
              <Detail label="Fee" value={money(intent.fee_amount)} />
              <Detail label="Net amount" value={money(intent.net_amount)} emphasized />
              <Detail label="Fee difference" value={money(netDifference)} />
              <Detail label="Asset" value={intent.asset_code} />
            </View>
          </View>

          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ gap: 2 }}>
              <VadText variant="heading">Transaction record</VadText>
              <VadText variant="caption" tone="secondary">
                Keep the reference when investigating a payment issue.
              </VadText>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              <Detail label="Reference" value={intent.intent_public_id} selectable />
              <Detail
                label="Payment route"
                value={intent.provider_configured ? 'Configured' : 'Not configured'}
              />
              <Detail
                label="Created"
                value={new Date(intent.created_at).toLocaleString()}
              />
              <Detail
                label="Settled"
                value={
                  intent.settled_at
                    ? new Date(intent.settled_at).toLocaleString()
                    : 'Not settled yet'
                }
              />
            </View>
          </View>
        </View>

        <View style={{ flex: 0.9, width: '100%', gap: theme.spacing.xl }}>
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ gap: 2 }}>
              <VadText variant="heading">Payment progress</VadText>
              <VadText variant="caption" tone="secondary">
                External payment status, not a replacement for ledger state.
              </VadText>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              <StatusStep
                label="Intent created"
                detail={new Date(intent.created_at).toLocaleString()}
                state="complete"
              />
              <StatusStep
                label="Provider processing"
                detail={
                  failed
                    ? 'Provider processing ended with an issue.'
                    : settled
                      ? 'Provider processing completed.'
                      : 'Waiting for the payment route to complete.'
                }
                state={failed ? 'failed' : settled ? 'complete' : 'active'}
              />
              <StatusStep
                label="Settlement"
                detail={
                  intent.settled_at
                    ? new Date(intent.settled_at).toLocaleString()
                    : failed
                      ? 'Not settled because this intent did not complete.'
                      : 'Waiting for a final provider state.'
                }
                state={settled ? 'complete' : failed ? 'failed' : 'waiting'}
              />
            </View>
          </View>

          {intent.failure_code ? (
            <View
              style={{
                borderLeftWidth: 3,
                borderLeftColor: theme.colors.danger,
                backgroundColor: theme.colors.noSoft,
                padding: theme.spacing.md,
                gap: theme.spacing.xs,
              }}
            >
              <VadText variant="caption" tone="danger">PAYMENT ISSUE</VadText>
              <VadText variant="bodyStrong">
                {intent.failure_code.replaceAll('_', ' ')}
              </VadText>
              <VadText variant="caption" tone="secondary">
                Refresh after the underlying issue is resolved. Do not assume a
                retry succeeded until a new authoritative payment state appears.
              </VadText>
            </View>
          ) : processing ? (
            <View
              style={{
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: theme.colors.border,
                paddingVertical: theme.spacing.md,
                gap: 2,
              }}
            >
              <VadText variant="bodyStrong">Still processing</VadText>
              <VadText variant="caption" tone="secondary">
                You can leave this screen and return from Wallet activity later.
              </VadText>
            </View>
          ) : null}
        </View>
      </View>

      <VadText variant="caption" tone="tertiary">
        Payment intent state explains the external flow. Ledger balances remain
        authoritative for available, reserved and settled funds.
      </VadText>
    </View>
  );
}

function operationLabel(operation: PaymentIntentRow['operation']) {
  if (operation === 'DEPOSIT') return 'Deposit';
  if (operation === 'WITHDRAWAL') return 'Withdrawal';
  return 'Refund';
}

function StatusStep({
  label,
  detail,
  state,
}: {
  label: string;
  detail: string;
  state: 'complete' | 'active' | 'waiting' | 'failed';
}) {
  const theme = useVadTheme();

  const tone =
    state === 'complete'
      ? 'yes'
      : state === 'active'
        ? 'brand'
        : state === 'failed'
          ? 'danger'
          : 'tertiary';

  return (
    <View
      style={{
        minHeight: 68,
        paddingVertical: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            state === 'complete'
              ? theme.colors.yesSoft
              : state === 'active'
                ? theme.colors.brandSoft
                : state === 'failed'
                  ? theme.colors.noSoft
                  : theme.colors.surfaceRaised,
        }}
      >
        <VadText variant="caption" tone={tone}>
          {state === 'complete'
            ? '✓'
            : state === 'active'
              ? '•'
              : state === 'failed'
                ? '!'
                : '–'}
        </VadText>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">{label}</VadText>
        <VadText variant="caption" tone="secondary">{detail}</VadText>
      </View>
    </View>
  );
}

function Detail({
  label,
  value,
  selectable = false,
  emphasized = false,
}: {
  label: string;
  value: string;
  selectable?: boolean;
  emphasized?: boolean;
}) {
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
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>
        {label}
      </VadText>
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
