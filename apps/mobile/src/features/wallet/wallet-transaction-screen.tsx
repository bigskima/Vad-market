import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import { getMyPaymentIntents, type PaymentIntentRow } from '@/services/payment-api';

export function WalletTransactionScreen({ intentId }: { intentId: string }) {
  const theme = useVadTheme();
  const [intent, setIntent] = useState<PaymentIntentRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await getMyPaymentIntents(100);
      setIntent(rows.find((row) => row.intent_public_id === intentId) ?? null);
    } catch {
      setIntent(null);
    } finally {
      setLoading(false);
    }
  }, [intentId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton height={110} />
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

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View
        style={{
          borderRadius: theme.radius.xl,
          backgroundColor: incoming ? theme.colors.yesSoft : theme.colors.surfaceRaised,
          padding: theme.spacing.xl,
          gap: theme.spacing.xs,
        }}
      >
        <VadText variant="caption" tone={incoming ? 'yes' : 'secondary'}>
          {intent.operation}
        </VadText>
        <VadText variant="display">{money(intent.amount)}</VadText>
        <VadText variant="bodyStrong">{intent.status.replaceAll('_', ' ')}</VadText>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        <Detail label="Reference" value={intent.intent_public_id} />
        <Detail label="Asset" value={intent.asset_code} />
        <Detail label="Amount" value={money(intent.amount)} />
        <Detail label="Fee" value={money(intent.fee_amount)} />
        <Detail label="Net amount" value={money(intent.net_amount)} />
        <Detail label="Created" value={new Date(intent.created_at).toLocaleString()} />
        <Detail
          label="Settled"
          value={intent.settled_at ? new Date(intent.settled_at).toLocaleString() : 'Not settled yet'}
        />
        <Detail
          label="Payment route"
          value={intent.provider_configured ? 'Configured' : 'Not configured'}
        />
      </View>

      {intent.failure_code ? (
        <View
          style={{
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.warningSoft,
            padding: theme.spacing.md,
            gap: 2,
          }}
        >
          <VadText variant="caption" tone="warning">PAYMENT ISSUE</VadText>
          <VadText variant="bodyStrong">{intent.failure_code.replaceAll('_', ' ')}</VadText>
        </View>
      ) : null}
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
      <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>{label}</VadText>
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
