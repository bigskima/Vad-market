import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
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
  const [intent, setIntent] = useState<PaymentIntentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);

    try {
      const rows = await getMyPaymentIntents(100);
      setIntent(
        rows.find((row) => row.intent_public_id === intentId) ?? null,
      );
    } catch {
      setIntent(null);
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
        <VadSkeleton height={150} radius={theme.radius.xl} />
        <VadSkeleton height={58} />
        <VadSkeleton height={58} />
        <VadSkeleton height={58} />
      </View>
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
  const normalizedStatus = intent.status.replaceAll('_', ' ');
  const settled = Boolean(intent.settled_at);
  const failed = Boolean(intent.failure_code);

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
            alignItems: 'flex-start',
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="caption" tone={incoming ? 'yes' : 'secondary'}>
              {intent.operation}
            </VadText>
            <VadText variant="display">{money(intent.amount)}</VadText>
          </View>

          <VadText
            variant="caption"
            tone={settled ? 'yes' : failed ? 'danger' : 'brand'}
          >
            {normalizedStatus}
          </VadText>
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.md,
            flexDirection: 'row',
            gap: theme.spacing.xl,
            flexWrap: 'wrap',
          }}
        >
          <MoneyFact label="Fee" value={money(intent.fee_amount)} />
          <MoneyFact label="Net" value={money(intent.net_amount)} emphasized />
          <MoneyFact label="Asset" value={intent.asset_code} />
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <VadText variant="heading">Status</VadText>
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          }}
        >
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
            label="Settled"
            detail={
              intent.settled_at
                ? new Date(intent.settled_at).toLocaleString()
                : 'Not settled yet'
            }
            state={settled ? 'complete' : failed ? 'waiting' : 'waiting'}
          />
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <VadText variant="heading">Transaction details</VadText>
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          <Detail label="Reference" value={intent.intent_public_id} selectable />
          <Detail
            label="Payment route"
            value={intent.provider_configured ? 'Configured' : 'Not configured'}
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
            gap: 2,
          }}
        >
          <VadText variant="caption" tone="danger">PAYMENT ISSUE</VadText>
          <VadText variant="bodyStrong">
            {intent.failure_code.replaceAll('_', ' ')}
          </VadText>
          <VadText variant="caption" tone="secondary">
            Refresh this transaction after the underlying issue has been resolved.
          </VadText>
        </View>
      ) : null}

      <VadButton
        label="Refresh transaction status"
        variant="secondary"
        loading={refreshing}
        onPress={() => void load(true)}
      />

      <VadText variant="caption" tone="tertiary">
        Payment intent state explains the external flow. Ledger balances remain
        authoritative for available, reserved and settled funds.
      </VadText>
    </View>
  );
}

function MoneyFact({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={{ minWidth: 90, flexGrow: 1, flexBasis: 100, gap: 2 }}>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <VadText
        variant={emphasized ? 'heading' : 'bodyStrong'}
        tone={emphasized ? 'brand' : 'primary'}
      >
        {value}
      </VadText>
    </View>
  );
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
        minHeight: 64,
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
          width: 28,
          height: 28,
          borderRadius: 14,
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
}: {
  label: string;
  value: string;
  selectable?: boolean;
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
        variant="bodyStrong"
        style={{ flex: 1.6, textAlign: 'right' }}
        numberOfLines={selectable ? undefined : 2}
        selectable={selectable}
      >
        {value}
      </VadText>
    </View>
  );
}
