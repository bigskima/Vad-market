import { useEffect, useMemo, useState } from 'react';
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
import { TourTarget } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { useCurrencyPreference, type VADCurrency } from '@/providers/currency-preference-provider';
import type { PaymentIntentRow } from '@/services/payment-api';
import { getWalletBalanceHistory, type WalletActivityRow, type WalletBalanceHistoryRow, type WalletRow } from '@/services/market-api';

export function WalletScreen({
  wallets,
  walletActivity,
  walletActivityError,
  unreadNotificationCount,
  onDeposit,
  onWithdraw,
  onTransfer,
  onActivity,
  onNotifications,
  activeAssetCodes,
}: {
  wallets: WalletRow[];
  walletActivity: WalletActivityRow[];
  walletActivityError: string | null;
  unreadNotificationCount: number;
  onDeposit: () => void;
  onWithdraw: () => void;
  onTransfer: () => void;
  onActivity: () => void;
  onNotifications: () => void;
  activeAssetCodes: string[];
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const currencyPreference = useCurrencyPreference();
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<VADCurrency | null>(null);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [manageCurrenciesOpen, setManageCurrenciesOpen] = useState(false);
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
  const [balanceHistory, setBalanceHistory] = useState<WalletBalanceHistoryRow[]>([]);
  const [balanceHistoryLoading, setBalanceHistoryLoading] = useState(true);
  const [balanceHistoryError, setBalanceHistoryError] = useState<string | null>(null);
  const hasNgn = activeAssetCodes.includes('NGN') && currencyPreference.isCurrencyEnabled('NGN');
  const hasUsdc = activeAssetCodes.includes('USDC') && currencyPreference.isCurrencyEnabled('USDC');

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void getWalletBalanceHistory(30)
        .then((rows) => {
          if (!active) return;
          setBalanceHistory(rows);
          setBalanceHistoryError(null);
        })
        .catch((error: unknown) => {
          if (!active) return;
          setBalanceHistoryError(error instanceof Error ? error.message : 'Wallet balance history is unavailable.');
        })
        .finally(() => {
          if (active) setBalanceHistoryLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const orderedWallets = useMemo(
    () => wallets
      .filter((wallet) => (
        (wallet.asset_code === 'NGN' || wallet.asset_code === 'USDC' || wallet.asset_code === 'TNGN')
        && currencyPreference.isCurrencyEnabled(wallet.asset_code as VADCurrency)
      ))
      .sort((a, b) => assetRank(a.asset_code) - assetRank(b.asset_code)),
    [wallets, currencyPreference],
  );
  const primary = orderedWallets.find((row) => row.asset_code === selectedAsset)
    ?? (hasNgn ? orderedWallets.find((row) => row.asset_code === 'NGN') ?? orderedWallets[0] : orderedWallets[0]);
  const primaryCode = primary?.asset_code ?? '';
  const available = Number(primary?.available ?? 0);
  const reserved = Number(primary?.reserved ?? 0);
  const pending = Number(primary?.withdrawal_pending ?? 0);
  const total = available + reserved + pending;
  const secondaryWallet = primaryCode === 'NGN'
    ? orderedWallets.find((wallet) => wallet.asset_code === 'USDC')
    : primaryCode === 'USDC'
      ? orderedWallets.find((wallet) => wallet.asset_code === 'NGN')
      : undefined;
  const secondaryTotal = secondaryWallet
    ? Number(secondaryWallet.available ?? 0) + Number(secondaryWallet.reserved ?? 0) + Number(secondaryWallet.withdrawal_pending ?? 0)
    : 0;
  const historyValues = balanceHistory
    .filter((row) => row.asset_code === primaryCode)
    .sort((a, b) => a.observed_on.localeCompare(b.observed_on))
    .map((row) => Number(row.balance))
    .filter(Number.isFinite);
  const recentActivity = useMemo(
    () => walletActivity
      .filter((row) => currencyPreference.isCurrencyEnabled(row.asset_code as VADCurrency))
      .slice()
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 4),
    [walletActivity, currencyPreference],
  );

  return (
    <View style={{ gap: density.phone ? 14 : theme.spacing.lg }}>
      <PageHeader title="Wallet" subtitle="Manage your funds for prediction markets." actions={[
        {
          icon: 'bell',
          label: unreadNotificationCount > 0 ? `Notifications, ${unreadNotificationCount} unread` : 'Notifications',
          badge: unreadNotificationCount > 0,
          onPress: onNotifications,
        },
        {
          icon: 'settings',
          label: manageCurrenciesOpen ? 'Close wallet settings' : 'Wallet settings',
          onPress: () => setManageCurrenciesOpen((value) => !value),
        },
      ]} />

      <TourTarget id="wallet-balance">
        <View style={{
          position: 'relative',
          borderRadius: 23,
          padding: density.phone ? 14 : 18,
          gap: 12,
          overflow: 'hidden',
          backgroundColor: theme.mode === 'dark' ? '#1A238E' : '#2838D4',
          borderWidth: 1,
          borderColor: '#4148E5',
        }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: -80, right: 66, width: 75, height: 330, backgroundColor: 'rgba(255,255,255,0.035)', transform: [{ rotate: '31deg' }] }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: -65, right: -8, width: 64, height: 300, backgroundColor: 'rgba(255,255,255,0.045)', transform: [{ rotate: '31deg' }] }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <VadText variant="body" tone="secondary" style={{ color: '#C9D0FF', fontSize: 14 }}>Total Balance</VadText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={balanceVisible ? 'Hide balance' : 'Show balance'}
                onPress={() => setBalanceVisible((value) => !value)}
                hitSlop={10}
                style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
              >
                <VadIcon name={balanceVisible ? 'eye' : 'eyeOff'} size={19} color="#DDE2FF" />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Select wallet currency, currently ${primaryCode || 'none'}`}
              accessibilityState={{ expanded: currencyPickerOpen }}
              onPress={() => setCurrencyPickerOpen((value) => !value)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 7,
                borderRadius: 18, paddingVertical: 7, paddingHorizontal: 12,
                borderWidth: 1, borderColor: 'rgba(196,204,255,0.28)',
                backgroundColor: 'rgba(6,10,53,0.22)', opacity: pressed ? 0.75 : 1,
              })}
            >
              <VadText variant="caption" style={{ color: '#F5F6FF', fontSize: 12 }}>{primaryCode || 'Currency'}</VadText>
              <VadIcon name={currencyPickerOpen ? 'close' : 'chevronRight'} size={13} color="#DDE2FF" />
            </Pressable>
          </View>

          {currencyPickerOpen && orderedWallets.length ? (
            <View style={{ alignSelf: 'flex-end', minWidth: 124, gap: 2, padding: 5, borderRadius: 12, backgroundColor: '#12185F', borderWidth: 1, borderColor: 'rgba(196,204,255,0.24)' }}>
              {orderedWallets.map((wallet) => (
                <Pressable
                  key={wallet.asset_code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: primaryCode === wallet.asset_code }}
                  onPress={() => { setSelectedAsset(wallet.asset_code as VADCurrency); setCurrencyPickerOpen(false); }}
                  style={({ pressed }) => ({ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: primaryCode === wallet.asset_code ? 'rgba(110,119,255,0.34)' : 'transparent', opacity: pressed ? 0.75 : 1 })}
                >
                  <VadText variant="caption" style={{ color: '#F5F6FF', fontSize: 12 }}>{wallet.asset_code}{primaryCode === wallet.asset_code ? '  ✓' : ''}</VadText>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 78 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <VadText variant="title" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: density.phone ? 31 : 37, lineHeight: density.phone ? 37 : 44, letterSpacing: -1, color: '#FFFFFF' }}>
                {balanceVisible && primary ? assetMoney(total, primaryCode) : '••••••••'}
              </VadText>
              {secondaryWallet ? (
                <VadText variant="caption" numberOfLines={1} adjustsFontSizeToFit style={{ color: '#C9D0FF', fontSize: 12 }}>
                  {balanceVisible ? `${secondaryWallet.asset_code} balance · ${assetMoney(secondaryTotal, secondaryWallet.asset_code)}` : `${secondaryWallet.asset_code} balance · ••••••`}
                </VadText>
              ) : primaryCode === 'TNGN' ? (
                <VadText variant="caption" style={{ color: '#C9D0FF', fontSize: 12 }}>Practice ledger · separate from real money</VadText>
              ) : (
                <VadText variant="caption" style={{ color: '#C9D0FF', fontSize: 12 }}>Wallet balance for {primaryCode || 'your selected currency'}</VadText>
              )}
            </View>
            <View style={{ width: Math.max(108, Math.min(174, density.width * 0.37)), alignItems: 'flex-end', justifyContent: 'center' }}>
              {balanceHistoryLoading ? (
                <VadSkeleton width={Math.max(104, Math.min(168, density.width * 0.36))} height={58} radius={12} />
              ) : (
                <WalletBalanceSparkline
                  values={historyValues}
                  width={Math.max(108, Math.min(174, density.width * 0.37))}
                  height={66}
                  color="#8E88FF"
                />
              )}
            </View>
          </View>
          {balanceHistoryError && !balanceHistory.length ? (
            <VadText variant="caption" style={{ color: '#D4D8FF' }}>Balance trend temporarily unavailable; the amount above remains the current wallet summary.</VadText>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <WalletBalanceMetric icon="wallet" label="Available" value={balanceVisible ? assetMoney(available, primaryCode) : '••••••'} tone="available" />
            <WalletBalanceMetric icon="clock" label="In Use (Active Predictions)" value={balanceVisible ? assetMoney(reserved + pending, primaryCode) : '••••••'} tone="inUse" />
          </View>
        </View>
      </TourTarget>

      {manageCurrenciesOpen ? (
        <VadCard variant="surface" style={{ padding: density.phone ? 12 : 16, gap: theme.spacing.sm, borderRadius: 18 }}>
          <View style={{ gap: 3 }}>
            <VadText variant="bodyStrong">Wallet settings</VadText>
            <VadText variant="caption" tone="secondary">Choose which eligible currencies appear across the wallet, markets and portfolio. The settings do not convert balances or change jurisdiction eligibility.</VadText>
          </View>
          <View style={{ gap: 8 }}>
            {currencyPreference.eligibleCurrencies.map((currency) => (
              <CurrencyToggle
                key={currency}
                currency={currency}
                displayName={currency === 'TNGN' ? 'TNGN practice balance' : currency === 'NGN' ? 'Nigerian Naira' : currency === 'USDC' ? 'USDC' : currency}
                enabled={currencyPreference.isCurrencyEnabled(currency)}
                available={activeAssetCodes.includes(currency)}
                onToggle={() => currencyPreference.toggleCurrency(currency)}
              />
            ))}
          </View>
        </VadCard>
      ) : null}

      <TourTarget id="wallet-actions">
        <View style={{ flexDirection: 'row', gap: density.phone ? 6 : theme.spacing.sm }}>
          <WalletAction label="Deposit" detail="Add funds" icon="plus" tone="yes" onPress={onDeposit} disabled={!hasNgn} />
          <WalletAction label="Withdraw" detail="Send to bank" icon="arrowUp" tone="brand" onPress={onWithdraw} disabled={!hasNgn} />
          <WalletAction label="Transfer" detail="To another user" icon="transfer" tone="purple" onPress={onTransfer} />
          <WalletAction label="History" detail="View transactions" icon="fileText" tone="primary" onPress={onActivity} />
        </View>
      </TourTarget>

      <View style={{ gap: density.phone ? 8 : theme.spacing.sm }}>
        <VadSectionHeader title="Your Currencies" actionLabel="Manage" onAction={() => setManageCurrenciesOpen((value) => !value)} />
        {orderedWallets.map((wallet) => (
          <Pressable key={wallet.asset_code} accessibilityRole="button" accessibilityLabel={`Select ${wallet.asset_code} wallet`} onPress={() => setSelectedAsset(wallet.asset_code as VADCurrency)}>
            <CompactCurrencyBalance wallet={wallet} selected={primaryCode === wallet.asset_code} balanceVisible={balanceVisible} />
          </Pressable>
        ))}
        {!orderedWallets.length ? <VadEmptyState title="No supported wallet accounts" body="Your account has no enabled wallet balances to display." /> : null}
      </View>

      <TourTarget id="wallet-activity">
        <View style={{ gap: density.phone ? theme.spacing.sm : theme.spacing.md }}>
          <VadSectionHeader title="Recent Transactions" actionLabel="See all" onAction={onActivity} />
          {walletActivityError && !recentActivity.length ? (
            <VadErrorState title="Wallet activity unavailable" message={walletActivityError} onRetry={onActivity} />
          ) : recentActivity.length ? (
            <View style={{ gap: density.compact ? 7 : theme.spacing.sm }}>
              {recentActivity.map((row) => <RecentWalletActivityRow key={row.activity_id + row.account_type} row={row} onPress={onActivity} />)}
            </View>
          ) : (
            <VadEmptyState title="No transactions yet" body="Deposits, predictions, releases, refunds and settlement results appear after the ledger records them." actionLabel="Deposit NGN" onAction={onDeposit} />
          )}
          {walletActivityError ? <VadText variant="caption" tone="secondary">Some recent activity could not be refreshed. Open History to retry the complete ledger.</VadText> : null}
        </View>
      </TourTarget>

      <View style={{ gap: density.phone ? 8 : theme.spacing.sm }}>
        <VadSectionHeader title="Embedded Wallet" subtitle="Self-custody USDC and on-chain addresses, separate from the VAD account ledger." />
        <WalletSectionErrorBoundary title="Embedded wallet unavailable">
          <CryptoWalletConnections />
        </WalletSectionErrorBoundary>
        {hasUsdc ? (
          <WalletSectionErrorBoundary title="USDC on-chain balances unavailable">
            <UsdcWalletBalances />
          </WalletSectionErrorBoundary>
        ) : (
          <VadCard variant="raised" style={{ gap: 4 }}>
            <VadText variant="bodyStrong">On-chain USDC balances</VadText>
            <VadText variant="caption" tone="secondary">Enable USDC for this account where eligible to view connected-network balances. Self-custody holdings are not added to the internal-ledger total above.</VadText>
          </VadCard>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: advancedToolsOpen }}
        onPress={() => setAdvancedToolsOpen((value) => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="bodyStrong">More on-chain tools</VadText>
          <VadText variant="caption" tone="secondary">On-chain activity and market positions</VadText>
        </View>
        <VadIcon name={advancedToolsOpen ? 'close' : 'chevronRight'} size={18} tone="secondary" />
      </Pressable>
      {advancedToolsOpen ? (
        <View style={{ gap: density.sectionGap }}>
          <WalletSectionErrorBoundary title="On-chain activity unavailable">
            <OnchainActivityPanel enabled={hasUsdc} />
          </WalletSectionErrorBoundary>
          <WalletSectionErrorBoundary title="USDC positions unavailable">
            <OnchainPositionsPanel enabled={hasUsdc} />
          </WalletSectionErrorBoundary>
        </View>
      ) : null}
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
  const currency = wallet.asset_code === 'NGN' ? 'Naira' : wallet.asset_code === 'TNGN' ? 'Test Naira · separate demo ledger' : 'USD Coin';

  return (
    <VadCard variant="raised" style={{ paddingVertical: 12, paddingHorizontal: 14, gap: 10, borderRadius: 17, borderColor: selected ? theme.colors.brandPrimary : theme.colors.border, borderWidth: selected ? 1.5 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceMuted }}>
          <VadText variant="caption" tone="brand" style={{ fontWeight: '800' }}>{wallet.asset_code === 'NGN' ? '₦' : wallet.asset_code === 'TNGN' ? 'T' : '$'}</VadText>
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
  if (code === 'TNGN') return 2;
  return 10;
}
