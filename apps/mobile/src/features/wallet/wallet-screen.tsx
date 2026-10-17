import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadProgressiveSection } from '@/components/ui/vad-progressive-section';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { assetMoney } from '@/features/markets/format';
import { CryptoWalletConnections } from '@/features/wallet/crypto-wallet-connections';
import { OnchainActivityPanel } from '@/features/wallet/onchain-activity-panel';
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
  activeAssetCodes,
}: {
  wallets: WalletRow[];
  onDeposit: () => void;
  onWithdraw: () => void;
  onActivity: () => void;
  onOpenTransaction: (intent: PaymentIntentRow) => void;
  activeAssetCodes: string[];
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [intents, setIntents] = useState<PaymentIntentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);
  const hasNgn = activeAssetCodes.includes('NGN');
  const hasUsdc = activeAssetCodes.includes('USDC');

  const load = useCallback(async () => {
    if (!hasNgn) {
      setIntents([]);
      setLoading(false);
      setActivityError(null);
      return;
    }
    setActivityError(null);
    try {
      setIntents(await getMyPaymentIntents(6));
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : 'We could not load wallet activity right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [hasNgn]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const orderedWallets = useMemo(
    () => wallets
      .filter((wallet) => wallet.asset_code !== 'USDC')
      .sort((a, b) => assetRank(a.asset_code) - assetRank(b.asset_code)),
    [wallets],
  );
  const primary = hasNgn
    ? orderedWallets.find((row) => row.asset_code === 'NGN') ?? orderedWallets[0]
    : orderedWallets[0];
  const available = Number(primary?.available ?? 0);
  const reserved = Number(primary?.reserved ?? 0);
  const pending = Number(primary?.withdrawal_pending ?? 0);
  const total = available + reserved + pending;
  const primaryCode = primary?.asset_code ?? '';
  const recentIntents = intents.slice(0, density.phone ? 3 : 4);

  return (
    <View style={{ gap: density.sectionGap }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <View style={{ gap: 2 }}>
          <VadText variant="title">Wallet</VadText>
          <VadText variant="caption" tone="secondary">Your money, in one place</VadText>
        </View>
        {hasNgn ? (
          <Pressable accessibilityRole="button" accessibilityLabel="View all wallet activity" onPress={onActivity} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
            <VadIcon name="activity" size={15} tone="brand" />
            <VadText variant="label" tone="brand">Activity</VadText>
          </Pressable>
        ) : null}
      </View>

      {primary ? (
        <TourTarget id="wallet-balance">
          <VadCard variant="brand" style={{ gap: theme.spacing.md, padding: density.phone ? 18 : theme.spacing.lg, borderRadius: 26 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
              <View style={{ gap: 4 }}>
                <VadText variant="caption" tone="secondary">TOTAL BALANCE</VadText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.yes }} />
                  <VadText variant="caption" tone="secondary">{primaryCode} wallet</VadText>
                </View>
              </View>
              <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: theme.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <VadIcon name="wallet" size={21} tone="brand" />
              </View>
            </View>
            <VadText variant={density.phone ? 'display' : 'display'} numberOfLines={1} adjustsFontSizeToFit>{assetMoney(total, primaryCode)}</VadText>
            <View style={{ flexDirection: 'row', gap: 0, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              <View style={{ flex: 1, minWidth: 0, gap: 5, paddingRight: 8 }}>
                <VadText variant="caption" tone="secondary">Available</VadText>
                <VadText variant="bodyStrong" tone="yes" numberOfLines={1} adjustsFontSizeToFit>{assetMoney(available, primaryCode)}</VadText>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 5, paddingHorizontal: 8, borderLeftWidth: 1, borderLeftColor: theme.colors.border }}>
                <VadText variant="caption" tone="secondary">In positions</VadText>
                <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{assetMoney(reserved, primaryCode)}</VadText>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 5, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: theme.colors.border }}>
                <VadText variant="caption" tone="secondary">Pending</VadText>
                <VadText variant="bodyStrong" tone="brand" numberOfLines={1} adjustsFontSizeToFit>{assetMoney(pending, primaryCode)}</VadText>
              </View>
            </View>
          </VadCard>
        </TourTarget>
      ) : (
        <VadEmptyState title="Your wallet is ready" body="Balances will appear here when funds are available." />
      )}

      {hasNgn ? (
        <TourTarget id="wallet-actions">
        <View style={{ flexDirection: 'row', gap: density.phone ? 8 : theme.spacing.sm }}>
          <WalletAction label="Deposit" detail="Add NGN" icon="arrowDown" tone="yes" onPress={onDeposit} />
          <WalletAction label="Withdraw" detail="Move NGN out" icon="arrowUp" tone="brand" onPress={onWithdraw} />
          <WalletAction label="Activity" detail="Full ledger" icon="activity" tone="primary" onPress={onActivity} />
        </View>
        </TourTarget>
      ) : null}

      <VadProgressiveSection
        title="Crypto wallet"
        eyebrow="ON-CHAIN"
        description="Connect and manage your supported crypto wallet."
        icon="wallet"
        summary={<VadText variant="caption" tone="tertiary">{hasUsdc ? 'USDC enabled' : 'Wallet connections'}</VadText>}
      >
        <CryptoWalletConnections />
      </VadProgressiveSection>
      {hasUsdc ? (
        <VadProgressiveSection
          title="On-chain activity"
          icon="activity"
          description="Recent activity for your connected crypto assets."
        >
          <OnchainActivityPanel enabled={hasUsdc} />
        </VadProgressiveSection>
      ) : null}

      {orderedWallets.length ? (
        <VadProgressiveSection
          title="Other balances"
          eyebrow="ASSETS"
          description="Your balances across supported currencies."
          icon="wallet"
          summary={(
            <VadText variant="caption" tone="tertiary">
              {orderedWallets.map((wallet) => wallet.asset_code).join(' · ')}
            </VadText>
          )}
        >
          <View style={{ flexDirection: density.width >= 720 ? 'row' : 'column', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {orderedWallets.map((wallet) => (
              <AssetBalanceCard key={wallet.asset_code} wallet={wallet} />
            ))}
          </View>
        </VadProgressiveSection>
      ) : (
        <VadEmptyState
          title="No wallet balances yet"
          body="Balances appear when funds are available."
        />
      )}

      {hasNgn ? (
        <TourTarget id="wallet-activity">
          <View style={{ gap: density.phone ? theme.spacing.xs : theme.spacing.sm }}>
          <VadSectionHeader
            title="Recent payment activity"
            actionLabel="See all"
            onAction={onActivity}
          />

          {loading ? (
            <View style={{ gap: theme.spacing.sm }}>
              <VadSkeleton height={density.compact ? 68 : 76} radius={theme.radius.xl} />
              <VadSkeleton height={density.compact ? 68 : 76} radius={theme.radius.xl} />
              {density.phone ? null : <VadSkeleton height={76} radius={theme.radius.xl} />}
            </View>
          ) : activityError && !intents.length ? (
            <VadErrorState
              title="Activity unavailable"
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
              {recentIntents.length ? (
                <View style={{ gap: density.compact ? 7 : theme.spacing.sm }}>
                  {recentIntents.map((intent) => (
                    <PaymentRow key={intent.intent_public_id} intent={intent} onPress={() => onOpenTransaction(intent)} />
                  ))}
                </View>
              ) : (
                <VadEmptyState
                  title="No payment activity yet"
                  body="Deposits and withdrawals appear here."
                  actionLabel="Deposit NGN"
                  onAction={onDeposit}
                />
              )}
            </>
          )}
          </View>
        </TourTarget>
      ) : null}
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
            width: density.compact ? 32 : 36,
            height: density.compact ? 32 : 36,
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
          minHeight: density.phone ? 68 : 78,
          borderRadius: theme.radius.xl,
          backgroundColor: soft,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          padding: density.compact ? 6 : theme.spacing.sm,
          gap: 4,
        }}
      >
        <VadIcon name={icon} size={density.compact ? 19 : 22} tone={iconTone} />
        <VadText variant="label" numberOfLines={1}>{label}</VadText>
      </View>
    </Pressable>
  );
}

function assetRank(code: string) {
  if (code === 'NGN') return 0;
  if (code === 'USDC') return 1;
  return 10;
}
