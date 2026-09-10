import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

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
  const compact = width < 380;
  const [intents, setIntents] = useState<PaymentIntentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setActivityError(null);

    try {
      setIntents(await getMyPaymentIntents(6));
    } catch (error) {
      setActivityError(
        error instanceof Error
          ? error.message
          : 'Wallet activity could not be loaded.',
      );
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
    <View style={{ gap: compact ? theme.spacing.xxl : theme.spacing.xxxl }}>
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
            pending funds remain easy to understand.
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
          <VadText variant="display" numberOfLines={1} adjustsFontSizeToFit>
            {money(total)}
          </VadText>
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
            gap: compact ? theme.spacing.md : theme.spacing.xl,
          }}
        >
          <BalanceFact label="Available" value={money(available)} tone="yes" />
          <BalanceFact label="Reserved" value={money(reserved)} />
          <BalanceFact label="Pending" value={money(pending)} />
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          }}
        >
          <WalletAction
            label="Deposit"
            detail="Add NGN to your wallet"
            onPress={onDeposit}
          />
          <WalletAction
            label="Withdraw"
            detail="Move available NGN out"
            onPress={onWithdraw}
          />
          <WalletAction
            label="Wallet activity"
            detail="See deposits and withdrawals"
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
        ) : activityError && !intents.length ? (
          <VadErrorState
            title="Wallet activity unavailable"
            message={activityError}
            onRetry={() => {
              setLoading(true);
              void load();
            }}
          />
        ) : (
          <>
            {activityError ? (
              <VadErrorState
                title="Wallet activity refresh failed"
                message={activityError}
                onRetry={() => void load()}
              />
            ) : null}

            {intents.length ? (
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
          </>
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
      <View style={{ width: 6, alignSelf: 'stretch', justifyContent: 'center' }}>
        <View
          style={{
            width: 3,
            height: 28,
            borderRadius: theme.radius.pill,
            backgroundColor: incoming
              ? theme.colors.yes
              : theme.colors.brandPrimary,
          }}
        />
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
          <VadText variant="caption" tone="brand">Open</VadText>
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
    <View style={{ minWidth: 92, flexGrow: 1, flexBasis: 110, gap: 2 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong" tone={tone} numberOfLines={1}>
        {value}
      </VadText>
    </View>
  );
}

function WalletAction({
  label,
  detail,
  onPress,
}: {
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
        minHeight: 62,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingVertical: theme.spacing.sm,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">{label}</VadText>
        <VadText variant="caption" tone="secondary">{detail}</VadText>
      </View>

      <VadText variant="label" tone="brand">Open</VadText>
    </Pressable>
  );
}
