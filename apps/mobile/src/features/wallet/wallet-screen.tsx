import { useCallback, useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import { getMyPaymentIntents, type PaymentIntentRow } from '@/services/payment-api';
import type { WalletRow } from '@/services/market-api';

export function WalletScreen({ ngn, onDeposit, onWithdraw, onActivity, onOpenTransaction }: { ngn?: WalletRow; onDeposit: () => void; onWithdraw: () => void; onActivity: () => void; onOpenTransaction: (intent: PaymentIntentRow) => void }) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const [intents, setIntents] = useState<PaymentIntentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setActivityError(null);
    try {
      setIntents(await getMyPaymentIntents(6));
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : 'Wallet activity could not be loaded.');
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
        <VadText variant="caption" tone="brand">WALLET</VadText>
        <VadText variant="title">Your money</VadText>
      </View>

      <VadCard variant="brand" style={{ gap: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.md }}>
          <View style={{ gap: 2, flex: 1 }}>
            <VadText variant="caption" tone="secondary">TOTAL NGN BALANCE</VadText>
            <VadText variant="display" numberOfLines={1} adjustsFontSizeToFit>{money(total)}</VadText>
          </View>
          <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}>
            <VadIcon name="wallet" size={23} tone="brand" />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <BalanceTile label="Available" value={money(available)} tone="yes" />
          <BalanceTile label="Reserved" value={money(reserved)} />
          <BalanceTile label="Pending" value={money(pending)} />
        </View>
      </VadCard>

      <View style={{ flexDirection: wide ? 'row' : 'row', gap: theme.spacing.sm }}>
        <WalletAction label="Deposit" detail="Add NGN" icon="arrowDown" tone="yes" onPress={onDeposit} />
        <WalletAction label="Withdraw" detail="Move out" icon="arrowUp" tone="brand" onPress={onWithdraw} />
        <WalletAction label="Activity" detail="History" icon="activity" tone="primary" onPress={onActivity} />
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md, alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="heading">Recent activity</VadText>
            <VadText variant="caption" tone="secondary">Latest deposits and withdrawals</VadText>
          </View>
          <Pressable accessibilityRole="button" onPress={onActivity} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <VadText variant="label" tone="brand">See all</VadText>
          </Pressable>
        </View>

        {loading ? (
          <><VadSkeleton height={76} radius={theme.radius.xl} /><VadSkeleton height={76} radius={theme.radius.xl} /></>
        ) : activityError && !intents.length ? (
          <VadErrorState title="Wallet activity unavailable" message={activityError} onRetry={() => { setLoading(true); void load(); }} />
        ) : (
          <>
            {activityError ? <VadErrorState title="Wallet activity refresh failed" message={activityError} onRetry={() => void load()} /> : null}
            {intents.length ? (
              <View style={{ gap: theme.spacing.sm }}>
                {intents.map((intent) => <PaymentRow key={intent.intent_public_id} intent={intent} onPress={() => onOpenTransaction(intent)} />)}
              </View>
            ) : (
              <VadEmptyState title="No payment activity yet" body="Deposits and withdrawals will appear here when payment intents are created." actionLabel="Deposit NGN" onAction={onDeposit} />
            )}
          </>
        )}
      </View>
    </View>
  );
}

export function PaymentRow({ intent, onPress }: { intent: PaymentIntentRow; onPress?: () => void }) {
  const theme = useVadTheme();
  const incoming = intent.operation === 'DEPOSIT';
  const label = incoming ? 'Deposit' : intent.operation === 'WITHDRAWAL' ? 'Withdrawal' : 'Refund';
  const icon: VadIconName = incoming ? 'arrowDown' : 'arrowUp';

  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ opacity: pressed && onPress ? 0.72 : 1, transform: [{ scale: pressed && onPress ? 0.992 : 1 }] })}>
      <VadCard variant="raised" style={{ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: incoming ? theme.colors.yesSoft : theme.colors.brandSoft }}>
          <VadIcon name={icon} size={20} tone={incoming ? 'yes' : 'brand'} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="bodyStrong">{label}</VadText>
          <VadText variant="caption" tone="tertiary">{new Date(intent.created_at).toLocaleDateString()}</VadText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <VadText variant="bodyStrong">{money(intent.amount)}</VadText>
          <VadChip label={intent.status.replaceAll('_', ' ')} tone={intent.status === 'SUCCEEDED' || intent.status === 'COMPLETED' ? 'yes' : 'neutral'} />
        </View>
      </VadCard>
    </Pressable>
  );
}

function BalanceTile({ label, value, tone = 'primary' }: { label: string; value: string; tone?: 'primary' | 'yes' }) {
  const theme = useVadTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, padding: theme.spacing.sm, gap: 1 }}>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
      <VadText variant="bodyStrong" tone={tone} numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function WalletAction({ label, detail, icon, tone, onPress }: { label: string; detail: string; icon: VadIconName; tone: 'yes' | 'brand' | 'primary'; onPress: () => void }) {
  const theme = useVadTheme();
  const soft = tone === 'yes' ? theme.colors.yesSoft : tone === 'brand' ? theme.colors.brandSoft : theme.colors.surfaceRaised;
  const iconTone = tone === 'yes' ? 'yes' : tone === 'brand' ? 'brand' : 'primary';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={detail} onPress={onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <View style={{ minHeight: 92, borderRadius: theme.radius.xl, backgroundColor: soft, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.sm, gap: 6 }}>
        <VadIcon name={icon} size={22} tone={iconTone} />
        <VadText variant="caption" tone="primary" numberOfLines={1}>{label}</VadText>
      </View>
    </Pressable>
  );
}
