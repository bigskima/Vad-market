import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getMyPaymentIntents,
  type PaymentIntentRow,
} from '@/services/payment-api';
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
  const { width } = useWindowDimensions();
  const wide = width >= 860;
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
          See what is available, reserved and moving through the payment rail
          without mixing cash with market exposure.
        </VadText>
      </View>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'stretch',
          gap: theme.spacing.md,
        }}
      >
        <View
          style={{
            flex: wide ? 1.3 : undefined,
            borderRadius: theme.radius.xl,
            backgroundColor: theme.colors.brandPrimary,
            padding: theme.spacing.xl,
            gap: theme.spacing.lg,
          }}
        >
          <View style={{ gap: 2 }}>
            <VadText variant="caption" tone="inverse">
              Total NGN balance
            </VadText>
            <VadText variant="display" tone="inverse">
              {money(total)}
            </VadText>
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.xl,
              flexWrap: 'wrap',
            }}
          >
            <BalanceFact label="Available" value={money(available)} />
            <BalanceFact label="Reserved" value={money(reserved)} />
            <BalanceFact label="Pending" value={money(pending)} />
          </View>
        </View>

        <View
          style={{
            flex: wide ? 0.7 : undefined,
            flexDirection: wide ? 'column' : 'row',
            gap: theme.spacing.sm,
          }}
        >
          <WalletAction
            glyph="↓"
            label="Deposit"
            detail="Add NGN"
            onPress={onDeposit}
            wide={wide}
          />
          <WalletAction
            glyph="↑"
            label="Withdraw"
            detail="Move NGN out"
            onPress={onWithdraw}
            wide={wide}
          />
          <WalletAction
            glyph="≡"
            label="Activity"
            detail="Payment history"
            onPress={onActivity}
            wide={wide}
          />
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View style={{ gap: 2 }}>
            <VadText variant="heading">Recent activity</VadText>
            <VadText variant="caption" tone="secondary">
              Latest deposit and withdrawal intents
            </VadText>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onActivity}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <VadText variant="label" tone="brand">See all</VadText>
          </Pressable>
        </View>

        {loading ? (
          <>
            <VadSkeleton height={62} />
            <VadSkeleton height={62} />
          </>
        ) : intents.length ? (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
            {intents.map((intent) => (
              <PaymentRow
                key={intent.intent_public_id}
                intent={intent}
                onPress={() => onOpenTransaction(intent)}
              />
            ))}
          </View>
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
        minHeight: 66,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingVertical: theme.spacing.sm,
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
          backgroundColor: incoming
            ? theme.colors.yesSoft
            : theme.colors.surfaceRaised,
        }}
      >
        <VadText
          variant="label"
          tone={incoming ? 'yes' : 'secondary'}
        >
          {incoming ? '↓' : '↑'}
        </VadText>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">
          {incoming
            ? 'Deposit'
            : intent.operation === 'WITHDRAWAL'
              ? 'Withdrawal'
              : 'Refund'}
        </VadText>
        <VadText variant="caption" tone="tertiary">
          {intent.status} ·{' '}
          {new Date(intent.created_at).toLocaleDateString()}
        </VadText>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <VadText variant="bodyStrong">{money(intent.amount)}</VadText>
        {onPress ? (
          <VadText variant="caption" tone="tertiary">›</VadText>
        ) : null}
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
  detail,
  onPress,
  wide,
}: {
  glyph: string;
  label: string;
  detail: string;
  onPress: () => void;
  wide: boolean;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: wide ? 68 : 74,
        alignItems: wide ? 'center' : 'center',
        justifyContent: 'center',
        flexDirection: wide ? 'row' : 'column',
        gap: theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.md,
        opacity: pressed ? 0.68 : 1,
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.brandSoft,
        }}
      >
        <VadText variant="label" tone="brand">{glyph}</VadText>
      </View>

      <View
        style={{
          flex: wide ? 1 : undefined,
          alignItems: wide ? 'flex-start' : 'center',
          gap: 1,
        }}
      >
        <VadText variant="label">{label}</VadText>
        {wide ? (
          <VadText variant="caption" tone="tertiary">{detail}</VadText>
        ) : null}
      </View>

      {wide ? (
        <VadText variant="caption" tone="tertiary">›</VadText>
      ) : null}
    </Pressable>
  );
}
