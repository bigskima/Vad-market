import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { PaymentRow } from '@/features/wallet/wallet-screen';
import { useVadTheme } from '@/providers/theme-provider';
import { getMyPaymentIntents, type PaymentIntentRow } from '@/services/payment-api';

export function WalletActivityScreen({
  onOpenTransaction,
}: {
  onOpenTransaction: (intent: PaymentIntentRow) => void;
}) {
  const theme = useVadTheme();
  const [rows, setRows] = useState<PaymentIntentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setRows(await getMyPaymentIntents(50));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="title">Payment activity</VadText>
        <VadText tone="secondary">
          Every deposit and withdrawal intent appears here with its current payment status.
        </VadText>
      </View>

      {loading ? (
        <>
          <VadSkeleton height={62} />
          <VadSkeleton height={62} />
          <VadSkeleton height={62} />
        </>
      ) : rows.length ? (
        rows.map((row) => (
          <PaymentRow
            key={row.intent_public_id}
            intent={row}
            onPress={() => onOpenTransaction(row)}
          />
        ))
      ) : (
        <VadEmptyState
          title="No payment activity yet"
          body="Your payment intents will appear here."
        />
      )}
    </View>
  );
}
