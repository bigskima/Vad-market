import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadMetricTile } from '@/components/ui/vad-metric-tile';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money } from '@/features/markets/format';
import { useProductDensity } from '@/hooks/use-product-density';
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
    <View style={{ gap: density.sectionGap }}>
      <VadSectionHeader
        title="Wallet"
        subtitle="Your spendable, reserved and pending NGN balances stay separated so every money movement is easy to understand."
        actionLabel="Activity"
        onAction={onActivity}
      />

      <VadCard
        variant="brand"
        style={{
          gap: density.phone ? theme.spacing.md : theme.spacing.lg,
          padding: density.phone ? theme.spacing.lg : theme.spacing.xl,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.md }}>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <VadText variant="caption" tone="brand">TOTAL NGN BALANCE</VadText>
            <VadText variant={density.phone ? 'title' : 'display'} numberOfLines={1} adjustsFontSizeToFit>
              {money(total)}
            </VadText>
            <VadText variant="caption" tone="secondary">Available + reserved + withdrawal pending</VadText>
          </View>
          <View
            style={{
              width: density.phone ? 48 : 56,
              height: density.phone ? 48 : 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <VadIcon name="wallet" size={density.phone ? 22 : 26} tone="brand" />
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <VadMetricTile label="Available" value={money(available)} detail="Ready to use" tone="yes" />
          <VadMetricTile label="Reserved" value={money(reserved)} detail="Committed to orders" />
          <VadMetricTile label="Pending" value={money(pending)} detail="Withdrawal processing" tone="brand" />
        </View>
      </VadCard>

      <View style={{ flexDirection: 'row', gap: density.phone ? 8 : theme.spacing.sm }}>
        <WalletAction label="Deposit" detail="Add NGN" icon="arrowDown" tone="yes" onPress={onDeposit} />
        <WalletAction label="Withdraw" detail="Move funds out" icon="arrowUp" tone="brand" onPress={onWithdraw} />
        <WalletAction label="Activity" detail="Payment history" icon="activity" tone="primary" onPress={onActivity} />
      </View>

      <View style={{ gap: density.phone ? theme.spacing.sm : theme.spacing.md }}>
        <VadSectionHeader
          title="Recent activity"
          subtitle="Latest deposits, withdrawals and refunds."
          actionLabel="See all"
          onAction={onActivity}
        />

        {loading ? (
          <View style={{ gap: theme.spacing.sm }}>
            <VadSkeleton height={density.compact ? 68 : 76} radius={theme.radius.xl} />
            <VadSkeleton height={density.compact ? 68 : 76} radius={theme.radius.xl} />
          </View>
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
              <VadErrorState title="Wallet activity refresh failed" message={activityError} onRetry={() => void load()} />
            ) : null}
            {intents.length ? (
              <View style={{ gap: density.compact ? 7 : theme.spacing.sm }}>
                {intents.map((intent) => (
                  <PaymentRow key={intent.intent_public_id} intent={intent} onPress={() => onOpenTransaction(intent)} />
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

export function PaymentRow({ intent, onPress }: { intent: PaymentIntentRow; onPress?: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const incoming = intent.operation === 'DEPOSIT';
  const label = incoming ? 'Deposit' : intent.operation === 'WITHDRAWAL' ? 'Withdrawal' : 'Refund';
  const icon: VadIconName = incoming ? 'arrowDown' : 'arrowUp';

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed && onPress ? 0.72 : 1,
        transform: [{ scale: pressed && onPress ? 0.992 : 1 }],
      })}
    >
      <VadCard
        variant="raised"
        style={{
          minHeight: density.compact ? 64 : 72,
          flexDirection: 'row',
          alignItems: 'center',
          gap: density.compact ? theme.spacing.sm : theme.spacing.md,
          paddingVertical: density.compact ? 9 : theme.spacing.sm,
        }}
      >
        <View
          style={{
            width: density.compact ? 36 : 42,
            height: density.compact ? 36 : 42,
            borderRadius: 21,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: incoming ? theme.colors.yesSoft : theme.colors.brandSoft,
          }}
        >
          <VadIcon name={icon} size={density.compact ? 17 : 19} tone={incoming ? 'yes' : 'brand'} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <VadText variant="bodyStrong">{label}</VadText>
          <VadText variant="caption" tone="tertiary">{new Date(intent.created_at).toLocaleString()}</VadText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3, maxWidth: '46%' }}>
          <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{money(intent.amount)}</VadText>
          <VadChip
            label={intent.status.replaceAll('_', ' ')}
            tone={intent.status === 'SUCCEEDED' || intent.status === 'COMPLETED' ? 'yes' : 'neutral'}
          />
        </View>
      </VadCard>
    </Pressable>
  );
}

function WalletAction({
  label,
  detail,
  icon,
  tone,
  onPress,
}: {
  label: string;
  detail: string;
  icon: VadIconName;
  tone: 'yes' | 'brand' | 'primary';
  onPress: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const soft = tone === 'yes' ? theme.colors.yesSoft : tone === 'brand' ? theme.colors.brandSoft : theme.colors.surfaceRaised;
  const iconTone = tone === 'yes' ? 'yes' : tone === 'brand' ? 'brand' : 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        opacity: pressed ? 0.7 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <View
        style={{
          minHeight: density.phone ? 78 : 96,
          borderRadius: theme.radius.xl,
          backgroundColor: soft,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          padding: density.compact ? 8 : theme.spacing.sm,
          gap: 4,
        }}
      >
        <VadIcon name={icon} size={density.compact ? 19 : 22} tone={iconTone} />
        <VadText variant="label" numberOfLines={1}>{label}</VadText>
        {!density.compact ? <VadText variant="caption" tone="tertiary" numberOfLines={1}>{detail}</VadText> : null}
      </View>
    </Pressable>
  );
}
