import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { PageHeader } from '@/features/navigation/page-header';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { assetMoney } from '@/features/markets/format';
import { CryptoWalletConnections } from '@/features/wallet/crypto-wallet-connections';
import { WalletSectionErrorBoundary } from '@/features/wallet/wallet-section-error-boundary';
import { OnchainActivityPanel } from '@/features/wallet/onchain-activity-panel';
import { OnchainPositionsPanel } from '@/features/wallet/onchain-positions-panel';
import { UsdcWalletBalances } from '@/features/wallet/usdc-wallet-balances';
import { TngnDemoModeCard } from '@/features/wallet/tngn-demo-mode-card';
import { TourTarget } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { useCurrencyPreference, type VADCurrency } from '@/providers/currency-preference-provider';
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
  const currencyPreference = useCurrencyPreference();
  const [intents, setIntents] = useState<PaymentIntentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<VADCurrency | null>(null);
  const [manageCurrenciesOpen, setManageCurrenciesOpen] = useState(false);
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
  const hasNgn = activeAssetCodes.includes('NGN') && currencyPreference.isCurrencyEnabled('NGN');
  const hasUsdc = activeAssetCodes.includes('USDC') && currencyPreference.isCurrencyEnabled('USDC');

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
    () => wallets.filter((wallet) => (wallet.asset_code === 'NGN' || wallet.asset_code === 'USDC') && currencyPreference.isCurrencyEnabled(wallet.asset_code as VADCurrency))
      .sort((a, b) => assetRank(a.asset_code) - assetRank(b.asset_code)),
    [wallets, currencyPreference],
  );
  const primary = orderedWallets.find((row) => row.asset_code === selectedAsset) ?? (hasNgn
    ? orderedWallets.find((row) => row.asset_code === 'NGN') ?? orderedWallets[0]
    : orderedWallets[0]);
  const available = Number(primary?.available ?? 0);
  const reserved = Number(primary?.reserved ?? 0);
  const pending = Number(primary?.withdrawal_pending ?? 0);
  const total = available + reserved + pending;
  const primaryCode = primary?.asset_code ?? '';
  const recentIntents = intents.slice(0, density.phone ? 3 : 4);

  return (
    <View style={{ gap: density.sectionGap }}>
      <PageHeader title="Wallet" subtitle="Manage your funds for prediction markets." actions={[
        { icon: 'bell', label: 'Wallet activity and notifications', onPress: onActivity },
        { icon: 'operations', label: manageCurrenciesOpen ? 'Close currency settings' : 'Wallet currency settings', onPress: () => setManageCurrenciesOpen((value) => !value) },
      ]} />
      <TourTarget id="wallet-balance">
        <View style={{ borderRadius: 22, padding: density.phone ? 12 : 16, gap: 10, overflow: 'hidden', backgroundColor: theme.colors.brandSoft, borderWidth: 1, borderColor: theme.colors.brandPrimary }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <VadText variant="body" tone="secondary">Total Balance</VadText>
              <Pressable accessibilityRole="button" accessibilityLabel={balanceVisible ? 'Hide balance' : 'Show balance'} onPress={() => setBalanceVisible((value) => !value)} hitSlop={10}><VadIcon name={balanceVisible ? 'eye' : 'eyeOff'} size={19} tone="secondary" /></Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              {orderedWallets.map((wallet) => <Pressable key={wallet.asset_code} accessibilityRole="button" accessibilityState={{ selected: primaryCode === wallet.asset_code }} onPress={() => setSelectedAsset(wallet.asset_code as VADCurrency)} style={{ borderRadius: 20, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: primaryCode === wallet.asset_code ? theme.colors.brandPrimary : theme.colors.border, backgroundColor: primaryCode === wallet.asset_code ? theme.colors.brandPrimary : theme.colors.surfaceMuted }}><VadText variant="caption" tone={primaryCode === wallet.asset_code ? 'inverse' : 'secondary'}>{wallet.asset_code}</VadText></Pressable>)}
            </View>
          </View>
          <VadText variant="title" style={{ fontSize: density.phone ? 26 : 30, lineHeight: density.phone ? 32 : 36, letterSpacing: -0.8 }} numberOfLines={1} adjustsFontSizeToFit>{balanceVisible && primary ? assetMoney(total, primaryCode) : '••••••••'}</VadText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0, borderRadius: 15, padding: 11, gap: 4, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}><VadText variant="caption" tone="secondary">Available</VadText><VadText variant="bodyStrong" tone="yes" numberOfLines={1} adjustsFontSizeToFit>{balanceVisible ? assetMoney(available, primaryCode) : '••••••'}</VadText></View>
            <View style={{ flex: 1, minWidth: 0, borderRadius: 15, padding: 11, gap: 4, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}><VadText variant="caption" tone="secondary">In Use</VadText><VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{balanceVisible ? assetMoney(reserved + pending, primaryCode) : '••••••'}</VadText></View>
          </View>
        </View>
      </TourTarget>
      <WalletSectionErrorBoundary title="TNGN sandbox account unavailable"><TngnDemoModeCard /></WalletSectionErrorBoundary>
      {manageCurrenciesOpen ? <VadCard variant="surface" style={{ padding: density.phone ? 12 : 16, gap: theme.spacing.sm, borderRadius: 18 }}>
        <View style={{ gap: 3 }}><VadText variant="bodyStrong">Manage currencies</VadText><VadText variant="caption" tone="secondary">Only currencies enabled by your account policy and available wallet balances can be selected.</VadText></View>
        <View style={{ flexDirection: 'row', gap: 8 }}>{currencyPreference.eligibleCurrencies.map((currency) => <CurrencyToggle key={currency} currency={currency} displayName={currencyPreference.isCurrencyEnabled(currency) ? currency : 'Additional currency'} enabled={currencyPreference.isCurrencyEnabled(currency)} available={activeAssetCodes.includes(currency) || currency === 'TNGN'} onToggle={() => currencyPreference.toggleCurrency(currency)} />)}</View>
      </VadCard> : null}
      {hasNgn ? <TourTarget id="wallet-actions"><View style={{ flexDirection: 'row', gap: density.phone ? 7 : theme.spacing.sm }}>
        <WalletAction label="Deposit" detail="Add funds" icon="arrowDown" tone="yes" onPress={onDeposit} />
        <WalletAction label="Withdraw" detail="Send to bank" icon="arrowUp" tone="brand" onPress={onWithdraw} />
        <WalletAction label="History" detail="View transactions" icon="activity" tone="primary" onPress={onActivity} />
      </View></TourTarget> : null}
      <View style={{ gap: density.phone ? 8 : theme.spacing.sm }}>
        <VadSectionHeader title="Your Currencies" actionLabel="Manage" onAction={() => setManageCurrenciesOpen((value) => !value)} />
        {orderedWallets.map((wallet) => <Pressable key={wallet.asset_code} accessibilityRole="button" accessibilityLabel={`Select ${wallet.asset_code} wallet`} onPress={() => setSelectedAsset(wallet.asset_code as VADCurrency)}><CompactCurrencyBalance wallet={wallet} selected={primaryCode === wallet.asset_code} balanceVisible={balanceVisible} /></Pressable>)}
        {!orderedWallets.length ? <VadEmptyState title="No supported wallet accounts" body="Your account has no enabled NGN or USDC wallet balance to display." /> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: advancedToolsOpen }} onPress={() => setAdvancedToolsOpen((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 }}>
        <View style={{ flex: 1, gap: 2 }}><VadText variant="bodyStrong">More wallet tools</VadText><VadText variant="caption" tone="secondary">Connected wallets, on-chain activity and positions</VadText></View>
        <VadIcon name={advancedToolsOpen ? 'close' : 'chevronRight'} size={18} tone="secondary" />
      </Pressable>
      {advancedToolsOpen ? <View style={{ gap: density.sectionGap }}>
        <WalletSectionErrorBoundary title="Embedded wallet unavailable"><CryptoWalletConnections /></WalletSectionErrorBoundary>
        {currencyPreference.isCurrencyEnabled('USDC') ? <WalletSectionErrorBoundary title="USDC balances unavailable"><UsdcWalletBalances /></WalletSectionErrorBoundary> : null}
        <WalletSectionErrorBoundary title="On-chain activity unavailable"><OnchainActivityPanel enabled={hasUsdc} /></WalletSectionErrorBoundary>
        <WalletSectionErrorBoundary title="USDC positions unavailable"><OnchainPositionsPanel enabled={hasUsdc} /></WalletSectionErrorBoundary>
      </View> : null}
      {hasNgn ? <TourTarget id="wallet-activity"><View style={{ gap: density.phone ? theme.spacing.sm : theme.spacing.md }}>
        <VadSectionHeader title="Recent Transactions" actionLabel="See all" onAction={onActivity} />
        {loading ? <View style={{ gap: theme.spacing.sm }}><VadSkeleton height={density.compact ? 68 : 76} radius={theme.radius.xl} /><VadSkeleton height={density.compact ? 68 : 76} radius={theme.radius.xl} />{density.phone ? null : <VadSkeleton height={76} radius={theme.radius.xl} />}</View>
        : activityError && !intents.length ? <VadErrorState title="Wallet activity unavailable" message={activityError} onRetry={() => { setLoading(true); void load(); }} />
        : <>{activityError ? <VadErrorState title="Could not refresh wallet activity" message={activityError} onRetry={() => void load()} /> : null}
          {recentIntents.length ? <View style={{ gap: density.compact ? 7 : theme.spacing.sm }}>{recentIntents.map((intent) => <PaymentRow key={intent.intent_public_id} intent={intent} onPress={() => onOpenTransaction(intent)} />)}</View>
          : <VadEmptyState title="No transactions yet" body="Deposits, withdrawals and refunds appear here after the payment service records them." actionLabel="Deposit NGN" onAction={onDeposit} />}</>}
      </View></TourTarget> : null}
    </View>
  );
}

function CurrencyToggle({ currency, displayName, enabled, available, onToggle }: { currency: VADCurrency; displayName: string; enabled: boolean; available: boolean; onToggle: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled, disabled: !available }}
      accessibilityLabel={enabled ? `Use ${currency} across VAD` : 'Enable an additional currency across VAD'}
      disabled={!available}
      onPress={onToggle}
      style={({ pressed }) => ({
        flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', gap: 7, paddingHorizontal: 10, paddingVertical: 8,
        borderRadius: 13, borderWidth: 1,
        borderColor: enabled ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: enabled ? theme.colors.brandSoft : theme.colors.surfaceMuted,
        opacity: !available ? 0.45 : pressed ? 0.78 : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <VadText variant="bodyStrong">{displayName}</VadText>
        <VadText variant="caption" tone="secondary">{available ? (enabled ? 'On across VAD' : 'Hidden across VAD') : 'Not available'}</VadText>
      </View>
      <View style={{ width: 30, height: 18, borderRadius: 9, padding: 2, justifyContent: 'center', alignItems: enabled ? 'flex-end' : 'flex-start', backgroundColor: enabled ? theme.colors.brandPrimary : theme.colors.border }}>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.colors.surface }} />
      </View>
    </Pressable>
  );
}

function CompactCurrencyBalance({ wallet, selected, balanceVisible }: { wallet: WalletRow; selected: boolean; balanceVisible: boolean }) {
  const theme = useVadTheme();
  const available = Number(wallet.available ?? 0);
  const reserved = Number(wallet.reserved ?? 0);
  const pending = Number(wallet.withdrawal_pending ?? 0);
  const total = available + reserved + pending;
  const currency = wallet.asset_code === 'NGN' ? 'Naira' : 'USD Coin';

  return (
    <VadCard variant="raised" style={{ paddingVertical: 12, paddingHorizontal: 14, gap: 10, borderRadius: 17, borderColor: selected ? theme.colors.brandPrimary : theme.colors.border, borderWidth: selected ? 1.5 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceMuted }}>
          <VadText variant="caption" tone="brand" style={{ fontWeight: '800' }}>{wallet.asset_code === 'NGN' ? '₦' : '$'}</VadText>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <VadText variant="bodyStrong">{wallet.asset_code}</VadText>
          <VadText variant="caption" tone="secondary">{currency}</VadText>
        </View>
        <View style={{ alignItems: 'flex-end', minWidth: 0, maxWidth: '54%', gap: 2 }}>
          <VadText variant="heading" numberOfLines={1} adjustsFontSizeToFit>{balanceVisible ? assetMoney(total, wallet.asset_code) : '••••••'}</VadText>
          <VadText variant="caption" tone="tertiary">Total balance</VadText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 0, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 9 }}>
        <BalanceFact label="Available" value={balanceVisible ? assetMoney(available, wallet.asset_code) : '••••••'} tone="yes" />
        <BalanceFact label="Reserved" value={balanceVisible ? assetMoney(reserved, wallet.asset_code) : '••••••'} />
        <BalanceFact label="Pending" value={balanceVisible ? assetMoney(pending, wallet.asset_code) : '••••••'} />
      </View>
    </VadCard>
  );
}

function BalanceFact({ label, value, tone = 'primary' }: { label: string; value: string; tone?: 'primary' | 'yes' }) {
  const theme = useVadTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2, paddingHorizontal: 7, borderLeftWidth: label === 'Available' ? 0 : 1, borderLeftColor: theme.colors.border }}>
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
  disabled = false,
}: {
  label: string;
  detail: string;
  icon: VadIconName;
  tone: 'yes' | 'brand' | 'primary';
  onPress: () => void;
  disabled?: boolean;
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
      disabled={disabled}
      style={({ pressed }) => ({
        flex: 1,
        opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
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
