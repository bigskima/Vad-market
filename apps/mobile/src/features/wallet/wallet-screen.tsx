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
    <View style={{ gap: theme.spacing.xxxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          alignItems: wide ? 'flex-end' : 'stretch',
          justifyContent: 'space-between',
          gap: theme.spacing.xl,
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">WALLET</VadText>
          <VadText variant="title">Your money in VAD.</VadText>
          <VadText tone="secondary">
            Cash stays separate from market exposure so available, reserved and
            pending funds are always easy to understand.
          </VadText>
        </View>

        <View
          style={{
            minWidth: wide ? 280 : undefined,
            gap: 2,
            alignItems: wide ? 'flex-end' : 'flex-start',
          }}
        >
          <VadText variant="caption" tone="secondary">TOTAL NGN BALANCE</VadText>
          <VadText variant="display">{money(total)}</VadText>
        </View>
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.lg,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.xl,
          }}
        >
          <BalanceFact label="Available" value={money(available)} tone="yes" />
          <BalanceFact label="Reserved" value={money(reserved)} />
          <BalanceFact label="Pending withdrawal" value={money(pending)} />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'stretch',
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingTop: theme.spacing.sm,
          }}
        >
          <WalletAction
            glyph="↓"
            label="Deposit"
            detail="Add NGN"
            onPress={onDeposit}
          />
          <Divider />
          <WalletAction
            glyph="↑"
            label="Withdraw"
            detail="Move NGN out"
            onPress={onWithdraw}
          />
          <Divider />
          <WalletAction
            glyph="≡"
            label="Activity"
            detail="Payment history"
            onPress={onActivity}
          />
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
            alignItems: 'flex-end',
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="heading">Recent activity</VadText>
            <VadText variant="caption" tone="secondary">
              Latest deposit and withdrawal intents
            </VadText>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onActivity}
            hitSlop={8}
            style={({ pressed }) => ({
              minHeight: 34,
              justifyContent: 'center',
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
            actionLabel="Deposit NGN"
            onAction={onDeposit}
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
      accessibilityRole={onPress ? 'button' : undefined}
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
          width: 34,
          height: 34,
          borderRadius: 17,
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
          {intent.status.replaceAll('_', ' ')} ·{' '}
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

function BalanceFact({
  label,
  value,
  tone = 'primary',
}: {
  label: string;
  value: string;
  tone?: 'primary' | 'yes';
}) {
  return (
    <View style={{ minWidth: 110, flexGrow: 1, flexBasis: 130, gap: 2 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong" tone={tone}>{value}</VadText>
    </View>
  );
}

function Divider() {
  const theme = useVadTheme();

  return (
    <View
      style={{
        width: 1,
        alignSelf: 'stretch',
        backgroundColor: theme.colors.border,
      }}
    />
  );
}

function WalletAction({
  glyph,
  label,
  detail,
  onPress,
}: {
  glyph: string;
  label: string;
  detail: string;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 64,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        paddingHorizontal: theme.spacing.xs,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <VadText variant="heading" tone="brand">{glyph}</VadText>
      <VadText variant="label">{label}</VadText>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>
        {detail}
      </VadText>
    </Pressable>
  );
}
