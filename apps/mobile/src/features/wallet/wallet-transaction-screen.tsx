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

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View
        style={{
          borderRadius: theme.radius.xl,
          backgroundColor: incoming
            ? theme.colors.yesSoft
            : theme.colors.surfaceRaised,
          padding: theme.spacing.xl,
          gap: theme.spacing.lg,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
            alignItems: 'flex-start',
          }}
        >
          <View style={{ gap: 2 }}>
            <VadText
              variant="caption"
              tone={incoming ? 'yes' : 'secondary'}
            >
              {intent.operation}
            </VadText>
            <VadText variant="display">{money(intent.amount)}</VadText>
          </View>

          <View
            style={{
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surface,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
            }}
          >
            <VadText
              variant="caption"
              tone={settled ? 'yes' : intent.failure_code ? 'warning' : 'brand'}
            >
              {normalizedStatus}
            </VadText>
          </View>
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingTop: theme.spacing.md,
            flexDirection: 'row',
            gap: theme.spacing.xl,
            flexWrap: 'wrap',
          }}
        >
          <MoneyFact label="Fee" value={money(intent.fee_amount)} />
          <MoneyFact label="Net" value={money(intent.net_amount)} />
          <MoneyFact label="Asset" value={intent.asset_code} />
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <VadText variant="heading">Transaction details</VadText>
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          <Detail label="Reference" value={intent.intent_public_id} />
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
            borderLeftColor: theme.colors.warning,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.warningSoft,
            padding: theme.spacing.md,
            gap: 2,
          }}
        >
          <VadText variant="caption" tone="warning">PAYMENT ISSUE</VadText>
          <VadText variant="bodyStrong">
            {intent.failure_code.replaceAll('_', ' ')}
          </VadText>
          <VadText variant="caption" tone="secondary">
            Refresh the transaction after the underlying issue has been resolved.
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
        Wallet activity reflects the payment intent state. Ledger balances remain
        authoritative for available and reserved funds.
      </VadText>
    </View>
  );
}

function MoneyFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 90, gap: 2 }}>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
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
      <VadText
        variant="caption"
        tone="tertiary"
        style={{ flex: 1 }}
      >
        {label}
      </VadText>
      <VadText
        variant="bodyStrong"
        style={{ flex: 1.6, textAlign: 'right' }}
        numberOfLines={2}
      >
        {value}
      </VadText>
    </View>
  );
}
