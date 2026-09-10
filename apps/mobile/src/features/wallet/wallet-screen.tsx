import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money } from '@/features/markets/format';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { getMyPaymentIntents, type PaymentIntentRow } from '@/services/payment-api';
import type { WalletRow } from '@/services/market-api';

export function WalletScreen({ ngn, onDeposit, onWithdraw, onActivity, onOpenTransaction }: { ngn?: WalletRow; onDeposit: () => void; onWithdraw: () => void; onActivity: () => void; onOpenTransaction: (intent: PaymentIntentRow) => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
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
    <View style={{ gap: density.compact ? theme.spacing.lg : theme.spacing.xl }}>
      <View style={{ gap: 2 }}>
        <VadText variant="caption" tone="brand">WALLET</VadText>
        <VadText variant="title">Your money</VadText>
      </View>

      <VadCard variant="brand" style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
          <View style={{ gap: 0, flex: 1 }}>
            <VadText variant="caption" tone="secondary">TOTAL NGN BALANCE</VadText>
            <VadText variant={density.compact ? 'title' : 'display'} numberOfLines={1} adjustsFontSizeToFit>{money(total)}</VadText>
          </View>
          <View style={{ width: density.compact ? 38 : 42, height: density.compact ? 38 : 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}>
            <VadIcon name="wallet" size={density.compact ? 18 : 20} tone="brand" />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: density.compact ? 6 : theme.spacing.sm }}>
          <BalanceTile label="Available" value={money(available)} tone="yes" />
          <BalanceTile label="Reserved" value={money(reserved)} />
          <BalanceTile label="Pending" value={money(pending)} />
        </View>
      </VadCard>

      <View style={{ flexDirection: 'row', gap: density.compact ? 6 : theme.spacing.sm }}>
        <WalletAction label="Deposit" detail="Add NGN" icon="arrowDown" tone="yes" onPress={onDeposit} />
        <WalletAction label="Withdraw" detail="Move out" icon="arrowUp" tone="brand" onPress={onWithdraw} />
        <WalletAction label="Activity" detail="History" icon="activity" tone="primary" onPress={onActivity} />
      </View>

      <View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md, alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 0 }}>
            <VadText variant="heading">Recent activity</VadText>
            <VadText variant="caption" tone="secondary">Latest deposits and withdrawals</VadText>
          </View>
          <Pressable accessibilityRole="button" onPress={onActivity} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <VadText variant="label" tone="brand">See all</VadText>
          </Pressable>
        </View>

        {loading ? (
          <><VadSkeleton height={density.compact ? 62 : 68} radius={theme.radius.lg} /><VadSkeleton height={density.compact ? 62 : 68} radius={theme.radius.lg} /></>
        ) : activityError && !intents.length ? (
          <VadErrorState title="Wallet activity unavailable" message={activityError} onRetry={() => { setLoading(true); void load(); }} />
        ) : (
          <>
            {activityError ? <VadErrorState title="Wallet activity refresh failed" message={activityError} onRetry={() => void load()} /> : null}
            {intents.length ? (
              <View style={{ gap: density.compact ? 6 : theme.spacing.sm }}>
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
  const density = useProductDensity();
  const incoming = intent.operation === 'DEPOSIT';
  const label = incoming ? 'Deposit' : intent.operation === 'WITHDRAWAL' ? 'Withdrawal' : 'Refund';
  const icon: VadIconName = incoming ? 'arrowDown' : 'arrowUp';

  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ opacity: pressed && onPress ? 0.72 : 1, transform: [{ scale: pressed && onPress ? 0.992 : 1 }] })}>
      <VadCard variant="raised" style={{ minHeight: density.compact ? 60 : 66, flexDirection: 'row', alignItems: 'center', gap: density.compact ? theme.spacing.sm : theme.spacing.md, paddingVertical: density.compact ? 9 : theme.spacing.sm }}>
        <View style={{ width: density.compact ? 34 : 38, height: density.compact ? 34 : 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: incoming ? theme.colors.yesSoft : theme.colors.brandSoft }}>
          <VadIcon name={icon} size={density.compact ? 16 : 18} tone={incoming ? 'yes' : 'brand'} />
        </View>
        <View style={{ flex: 1, gap: 0 }}>
          <VadText variant="bodyStrong">{label}</VadText>
          <VadText variant="caption" tone="tertiary">{new Date(intent.created_at).toLocaleDateString()}</VadText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2, maxWidth: '44%' }}>
          <VadText variant="bodyStrong" numberOfLines={1}>{money(intent.amount)}</VadText>
          <VadChip label={intent.status.replaceAll('_', ' ')} tone={intent.status === 'SUCCEEDED' || intent.status === 'COMPLETED' ? 'yes' : 'neutral'} />
        </View>
      </VadCard>
    </Pressable>
  );
}

function BalanceTile({ label, value, tone = 'primary' }: { label: string; value: string; tone?: 'primary' | 'yes' }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, paddingHorizontal: density.compact ? 8 : 10, paddingVertical: density.compact ? 7 : 9, gap: 0 }}>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
      <VadText variant="bodyStrong" tone={tone} numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function WalletAction({ label, detail, icon, tone, onPress }: { label: string; detail: string; icon: VadIconName; tone: 'yes' | 'brand' | 'primary'; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const soft = tone === 'yes' ? theme.colors.yesSoft : tone === 'brand' ? theme.colors.brandSoft : theme.colors.surfaceRaised;
  const iconTone = tone === 'yes' ? 'yes' : tone === 'brand' ? 'brand' : 'primary';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={detail} onPress={onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <View style={{ minHeight: density.compact ? 64 : density.phone ? 70 : 92, borderRadius: density.cardRadius, backgroundColor: soft, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', padding: density.compact ? 8 : theme.spacing.sm, gap: density.compact ? 3 : 5 }}>
        <VadIcon name={icon} size={density.compact ? 18 : 20} tone={iconTone} />
        <VadText variant="caption" tone="primary" numberOfLines={1}>{label}</VadText>
      </View>
    </Pressable>
  );
}
