import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { assetMoney } from '@/features/markets/format';
import { TourTarget } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { getMyPaymentIntents, type PaymentIntentRow } from '@/services/payment-api';
import type { WalletRow } from '@/services/market-api';

export function WalletScreen({
  wallets,
  onDeposit,
  onWithdraw,
  onActivity,
  onOpenTransaction,
}: {
  wallets: WalletRow[];
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
      setActivityError(error instanceof Error ? error.message : 'We could not load wallet activity right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const orderedWallets = useMemo(
    () => [...wallets].sort((a, b) => assetRank(a.asset_code) - assetRank(b.asset_code)),
    [wallets],
  );
  const primary = orderedWallets.find((row) => row.asset_code === 'NGN') ?? orderedWallets[0];
  const available = Number(primary?.available ?? 0);
  const reserved = Number(primary?.reserved ?? 0);
  const pending = Number(primary?.withdrawal_pending ?? 0);
  const total = available + reserved + pending;
  const primaryCode = primary?.asset_code ?? 'NGN';

  return (
    <View style={{ gap: density.sectionGap }}>
      <VadSectionHeader
        title="Wallet"
        subtitle="See your available, committed and pending balances for each currency. NGN and USDC are always kept separate."
        actionLabel="Activity"
        onAction={onActivity}
      />

      <TourTarget id="wallet-balance">
        <VadCard
          variant="brand"
          style={{
            gap: density.phone ? theme.spacing.md : theme.spacing.lg,
            padding: density.phone ? theme.spacing.lg : theme.spacing.xl,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.md }}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <VadText variant="caption" tone="brand">{primaryCode} BALANCE</VadText>
              <VadText variant={density.phone ? 'title' : 'display'} numberOfLines={1} adjustsFontSizeToFit>
                {assetMoney(total, primaryCode)}
              </VadText>
              <VadText variant="caption" tone="secondary">Available + committed + withdrawal pending</VadText>
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
            <VadMetricTile label="Available" value={assetMoney(available, primaryCode)} detail="Ready to use" tone="yes" />
            <VadMetricTile label="Committed" value={assetMoney(reserved, primaryCode)} detail="Held for open orders" />
            <VadMetricTile label="Pending" value={assetMoney(pending, primaryCode)} detail="Withdrawal processing" tone="brand" />
          </View>
        </VadCard>
      </TourTarget>

      {orderedWallets.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSectionHeader
            title="Currency balances"
            subtitle="Each currency balance is tracked separately."
          />
          <View style={{ flexDirection: density.width >= 720 ? 'row' : 'column', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {orderedWallets.map((wallet) => (
              <AssetBalanceCard key={wallet.asset_code} wallet={wallet} />
            ))}
          </View>
        </View>
      ) : (
        <VadEmptyState
          title="No wallet balances yet"
          body="Your balances will appear here when funds become available in your account."
        />
      )}

      <TourTarget id="wallet-actions">
        <View style={{ flexDirection: 'row', gap: density.phone ? 8 : theme.spacing.sm }}>
          <WalletAction label="Deposit" detail="Add NGN" icon="arrowDown" tone="yes" onPress={onDeposit} />
          <WalletAction label="Withdraw" detail="Move NGN out" icon="arrowUp" tone="brand" onPress={onWithdraw} />
          <WalletAction label="Activity" detail="Payment history" icon="activity" tone="primary" onPress={onActivity} />
        </View>
      </TourTarget>

      <TourTarget id="wallet-activity">
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
                <VadErrorState title="Could not refresh wallet activity" message={activityError} onRetry={() => void load()} />
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
                  body="Your deposits and withdrawals will appear here after you start them."
                  actionLabel="Deposit NGN"
                  onAction={onDeposit}
                />
              )}
            </>
          )}
        </View>
      </TourTarget>
    </View>
  );
}

function AssetBalanceCard({ wallet }: { wallet: WalletRow }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const available = Number(wallet.available ?? 0);
  const reserved = Number(wallet.reserved ?? 0);
  const pending = Number(wallet.withdrawal_pending ?? 0);
  const total = available + reserved + pending;

  return (
    <VadCard
      variant="raised"
      style={{
        flexGrow: 1,
        flexBasis: density.width >= 720 ? 260 : undefined,
        minWidth: 0,
        gap: theme.spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <VadText variant="caption" tone="tertiary">{wallet.asset_code}</VadText>
          <VadText variant="heading" numberOfLines={1} adjustsFontSizeToFit>{assetMoney(total, wallet.asset_code)}</VadText>
        </View>
        <VadChip label={wallet.asset_code === 'NGN' ? 'Naira' : wallet.asset_code === 'USDC' ? 'USDC' : 'Currency'} tone={wallet.asset_code === 'USDC' ? 'brand' : 'neutral'} />
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <AssetFact label="Available" value={assetMoney(available, wallet.asset_code)} tone="yes" />
        <AssetFact label="Committed" value={assetMoney(reserved, wallet.asset_code)} />
        <AssetFact label="Pending" value={assetMoney(pending, wallet.asset_code)} />
      </View>
    </VadCard>
  );
}

function AssetFact({ label, value, tone = 'primary' }: { label: string; value: string; tone?: 'primary' | 'yes' }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
      <VadText variant="caption" tone={tone} numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

export function PaymentRow({ intent, onPress }: { intent: PaymentIntentRow; onPress?: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const incoming = intent.operation === 'DEPOSIT';
  const label = incoming ? 'Deposit' : intent.operation === 'WITHDRAWAL' ? 'Withdrawal' : 'Refund';
  const icon: VadIconName = incoming ? 'arrowDown' : 'arrowUp';
  const status = paymentStatus(intent);

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
          <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{assetMoney(intent.amount, intent.asset_code)}</VadText>
          <VadChip label={status.label} tone={status.tone} />
        </View>
      </VadCard>
    </Pressable>
  );
}

function paymentStatus(intent: PaymentIntentRow): { label: string; tone: 'yes' | 'warning' | 'no' | 'neutral' } {
  if (intent.settled_at) return { label: 'COMPLETED', tone: 'yes' };
  if (intent.failure_code) return { label: 'NEEDS ATTENTION', tone: 'no' };
  const normalized = intent.status.toUpperCase();
  if (normalized === 'SUCCEEDED' || normalized === 'COMPLETED' || normalized === 'SETTLED' || normalized === 'SUCCESS') return { label: 'COMPLETED', tone: 'yes' };
  if (normalized.includes('FAIL') || normalized.includes('REJECT') || normalized.includes('CANCEL') || normalized.includes('EXPIRE')) return { label: 'NEEDS ATTENTION', tone: 'no' };
  if (normalized.includes('PENDING') || normalized.includes('PROCESS') || normalized.includes('CREATED') || normalized.includes('INIT')) return { label: 'PROCESSING', tone: 'warning' };
  return { label: 'IN PROGRESS', tone: 'neutral' };
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

function assetRank(code: string) {
  if (code === 'NGN') return 0;
  if (code === 'USDC') return 1;
  return 10;
}
