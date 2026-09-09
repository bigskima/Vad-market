import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import { getMyPaymentIntents, type PaymentIntentRow } from '@/services/payment-api';
import type { WalletRow } from '@/services/market-api';

export function WalletScreen({
  ngn,
  onDeposit,
  onWithdraw,
  onActivity,
  onOpenTransaction,
}: {
  ngn?: WalletRow;
  onDeposit: () => void;
  onWithdraw: () => void;
  onActivity: () => void;
  onOpenTransaction: (intent: PaymentIntentRow) => void;
}) {
  const theme = useVadTheme();
  const [intents, setIntents] = useState<PaymentIntentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setIntents(await getMyPaymentIntents(6));
    } catch {
      setIntents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const available = Number(ngn?.available ?? 0);
  const reserved = Number(ngn?.reserved ?? 0);
  const pending = Number(ngn?.withdrawal_pending ?? 0);
  const total = available + reserved + pending;

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">WALLET</VadText>
        <VadText variant="title">Your money in VAD.</VadText>
        <VadText tone="secondary">
          See what is available, reserved and moving through the payment rail without mixing cash with market exposure.
        </VadText>
      </View>

      <View
        style={{
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.brandPrimary,
          padding: theme.spacing.xl,
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ gap: 2 }}>
          <VadText variant="caption" tone="inverse">Total NGN balance</VadText>
          <VadText variant="display" tone="inverse">{money(total)}</VadText>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.xl, flexWrap: 'wrap' }}>
          <BalanceFact label="Available" value={money(available)} />
          <BalanceFact label="Reserved" value={money(reserved)} />
          <BalanceFact label="Pending" value={money(pending)} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <WalletAction glyph="↓" label="Deposit" onPress={onDeposit} />
        <WalletAction glyph="↑" label="Withdraw" onPress={onWithdraw} />
        <WalletAction glyph="≡" label="Activity" onPress={onActivity} />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <VadText variant="heading">Recent activity</VadText>
          <Pressable onPress={onActivity}>
            <VadText variant="label" tone="brand">See all</VadText>
          </Pressable>
        </View>

        {loading ? (
          <>
            <VadSkeleton height={62} />
            <VadSkeleton height={62} />
          </>
        ) : intents.length ? (
          intents.map((intent) => (
            <PaymentRow
              key={intent.intent_public_id}
              intent={intent}
              onPress={() => onOpenTransaction(intent)}
            />
          ))
        ) : (
          <VadEmptyState
            title="No payment activity yet"
            body="Deposits and withdrawals will appear here when payment intents are created."
          />
        )}
      </View>
    </View>
  );
}

export function PaymentRow({
  intent,
  onPress,
}: {
  intent: PaymentIntentRow;
  onPress?: () => void;
}) {
  const theme = useVadTheme();
  const incoming = intent.operation === 'DEPOSIT';

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        opacity: pressed && onPress ? 0.65 : 1,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: incoming ? theme.colors.yesSoft : theme.colors.surfaceRaised,
        }}
      >
        <VadText variant="label" tone={incoming ? 'yes' : 'secondary'}>
          {incoming ? '↓' : '↑'}
        </VadText>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">
          {incoming ? 'Deposit' : intent.operation === 'WITHDRAWAL' ? 'Withdrawal' : 'Refund'}
        </VadText>
        <VadText variant="caption" tone="tertiary">
          {intent.status} · {new Date(intent.created_at).toLocaleDateString()}
        </VadText>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <VadText variant="bodyStrong">{money(intent.amount)}</VadText>
        {onPress ? <VadText variant="caption" tone="tertiary">›</VadText> : null}
      </View>
    </Pressable>
  );
}

function BalanceFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 92, gap: 2 }}>
      <VadText variant="caption" tone="inverse">{label}</VadText>
      <VadText variant="bodyStrong" tone="inverse">{value}</VadText>
    </View>
  );
}

function WalletAction({
  glyph,
  label,
  onPress,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 72,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <VadText variant="heading" tone="brand">{glyph}</VadText>
      <VadText variant="caption">{label}</VadText>
    </Pressable>
  );
}
