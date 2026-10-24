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
import { EmbeddedWalletModal } from '@/features/wallet/embedded-wallet-modal';
import { WalletSectionErrorBoundary } from '@/features/wallet/wallet-section-error-boundary';
import { OnchainActivityPanel } from '@/features/wallet/onchain-activity-panel';
import { OnchainPositionsPanel } from '@/features/wallet/onchain-positions-panel';
import { TourTarget } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { useCurrencyPreference, type VADCurrency } from '@/providers/currency-preference-provider';
import type { PaymentIntentRow } from '@/services/payment-api';
import { getWalletBalanceHistory, type WalletActivityRow, type WalletBalanceHistoryRow, type WalletRow } from '@/services/market-api';
import { supabase } from '@/lib/supabase';

export function WalletScreen({
  wallets,
  walletActivity,
  walletActivityError,
  unreadNotificationCount,
  onDeposit,
  onWithdraw,
  onTransfer,
  onActivity,
  onRetryActivity,
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
  onRetryActivity: () => void;
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
  const [temporaryNgnCredit, setTemporaryNgnCredit] = useState<{
    active?: boolean;
    amount?: number | string;
    availableBalance?: number | string;
    withdrawalsBlocked?: boolean;
    transfersBlocked?: boolean;
    depositsBlocked?: boolean;
    marketOrdersUseStandardSettlement?: boolean;
    publicId?: string;
    message?: string;
  } | null>(null);
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

  useEffect(() => {
    let active = true;
    void supabase.rpc('my_temporary_ngn_test_credit_status')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setTemporaryNgnCredit(null);
          return;
        }
        setTemporaryNgnCredit(data && typeof data === 'object'
          ? data as NonNullable<typeof temporaryNgnCredit>
          : null);
      }, () => {
        if (active) setTemporaryNgnCredit(null);
      });
    return () => { active = false; };
  }, []);

  const orderedWallets = useMemo(
    () => wallets
      .filter((wallet) => (
        (wallet.asset_code === 'NGN' || wallet.asset_code === 'USDC')
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
            <WalletBalanceMetric icon="clock" label="In Use (Active Predictions)" value={balanceVisible ? assetMoney(reserved, primaryCode) : '••••••'} tone="inUse" />
          </View>
          {pending > 0 ? (
            <VadText variant="caption" style={{ color: '#D8DDFF', fontSize: 10.5 }}>
              Pending withdrawals · {balanceVisible ? assetMoney(pending, primaryCode) : '••••••'}
            </VadText>
          ) : null}
        </View>
      </TourTarget>

      {temporaryNgnCredit?.active ? (
        <VadCard variant="surface" style={{ gap: theme.spacing.sm, padding: theme.spacing.md, borderColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <VadText variant="bodyStrong">Temporary NGN market-test allocation</VadText>
            <VadChip label="Non-withdrawable" tone="warning" />
          </View>
          <View style={{ gap: 3 }}>
            <VadText variant="title">{assetMoney(Number(temporaryNgnCredit.amount ?? 0), 'NGN')}</VadText>
            <VadText variant="caption" tone="secondary">
              Current NGN available balance: {assetMoney(Number(temporaryNgnCredit.availableBalance ?? 0), 'NGN')}
            </VadText>
          </View>
          <VadText variant="caption" tone="secondary">
            This non-cash test allocation sits in the ordinary NGN ledger and uses the same market instrument, quote, pool stake, resolution and settlement engine as regular NGN markets. Deposits and withdrawals remain blocked. Email transfers are restricted to eligible, location-verified Nigerian VAD accounts whose NGN wallet can be safely marked as test credit; test funds cannot mix with cash-funded NGN.
          </VadText>
          {temporaryNgnCredit.publicId ? (
            <VadText variant="caption" tone="tertiary">Test-credit reference: {temporaryNgnCredit.publicId}</VadText>
          ) : null}
        </VadCard>
      ) : null}

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
                displayName={currency === 'NGN' ? 'Nigerian Naira' : 'USDC'}
                enabled={currencyPreference.isCurrencyEnabled(currency)}
                available={currencyPreference.isCurrencyEligible(currency)}
                onToggle={() => currencyPreference.toggleCurrency(currency)}
              />
            ))}
          </View>
        </VadCard>
      ) : null}

      <TourTarget id="wallet-actions">
        <View style={{ flexDirection: 'row', gap: density.phone ? 6 : theme.spacing.sm }}>
          <WalletAction label="Deposit" detail={temporaryNgnCredit?.active ? "Locked during test credit" : "Add funds"} icon="plus" tone="yes" onPress={onDeposit} disabled={!hasNgn || Boolean(temporaryNgnCredit?.active)} />
          <WalletAction label="Withdraw" detail={temporaryNgnCredit?.active ? "Locked during test credit" : "Send to bank"} icon="arrowUp" tone="brand" onPress={onWithdraw} disabled={!hasNgn || Boolean(temporaryNgnCredit?.active)} />
          <WalletAction label="Transfer" detail={temporaryNgnCredit?.active ? "Restricted test-credit transfer" : "To another user"} icon="transfer" tone="purple" onPress={onTransfer} />
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
            <VadErrorState title="Wallet activity unavailable" message={walletActivityError} onRetry={onRetryActivity} />
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

      <EmbeddedWalletModal showUsdcBalance={hasUsdc} />

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
  const name = wallet.asset_code === 'NGN' ? 'Nigerian Naira' : 'USD Coin';
  const subtitle = wallet.asset_code === 'USDC' ? 'USDC · VAD ledger' : 'NGN';

  return (
    <VadCard
      variant="raised"
      style={{
        minHeight: 68,
        paddingVertical: 9,
        paddingHorizontal: 11,
        borderRadius: 16,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        borderWidth: selected ? 1.5 : 1,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <CurrencyMark assetCode={wallet.asset_code} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <VadText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 14 }}>{name}</VadText>
          <VadText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 11.5 }}>{subtitle}</VadText>
        </View>
        <View style={{ alignItems: 'flex-end', minWidth: 0, maxWidth: '42%', gap: 2 }}>
          <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 14 }}>
            {balanceVisible ? assetMoney(total, wallet.asset_code) : '••••••'}
          </VadText>
          <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ fontSize: 10.5 }}>
            {selected ? 'Selected account' : wallet.asset_code}
          </VadText>
        </View>
        <VadIcon name="chevronRight" size={17} tone="tertiary" />
      </View>
    </VadCard>
  );
}

function CurrencyMark({ assetCode }: { assetCode: string }) {
  const theme = useVadTheme();
  if (assetCode === 'NGN') {
    return (
      <View style={{ width: 42, height: 42, borderRadius: 21, overflow: 'hidden', flexDirection: 'row', backgroundColor: '#0B9D66', flexShrink: 0 }}>
        <View style={{ flex: 1, backgroundColor: '#079B61' }} />
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
        <View style={{ flex: 1, backgroundColor: '#079B61' }} />
      </View>
    );
  }
  return (
    <View style={{
      width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
      backgroundColor: assetCode === 'USDC' ? '#2563EB' : theme.colors.brandPrimary,
      borderWidth: 1, borderColor: assetCode === 'USDC' ? '#60A5FA' : theme.colors.border,
      flexShrink: 0,
    }}>
      <VadText variant="heading" style={{ color: '#FFFFFF', fontSize: 19 }}>{assetCode === 'USDC' ? '$' : 'T'}</VadText>
    </View>
  );
}

function WalletBalanceMetric({ icon, label, value, tone }: {
  icon: VadIconName;
  label: string;
  value: string;
  tone: 'available' | 'inUse';
}) {
  const theme = useVadTheme();
  const accent = tone === 'available' ? '#18D6A3' : '#A78BFA';
  return (
    <View style={{
      flex: 1, minWidth: 0, minHeight: 61, borderRadius: 13, paddingHorizontal: 9, paddingVertical: 8,
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: 'rgba(5,10,53,0.32)', borderWidth: 1, borderColor: 'rgba(196,204,255,0.13)',
    }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: tone === 'available' ? 'rgba(24,214,163,0.18)' : 'rgba(167,139,250,0.18)', flexShrink: 0 }}>
        <VadIcon name={icon} size={16} color={accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <VadText variant="caption" numberOfLines={1} style={{ color: '#C9D0FF', fontSize: 10.5 }}>{label}</VadText>
        <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit style={{ color: '#FFFFFF', fontSize: 13 }}>{value}</VadText>
      </View>
    </View>
  );
}

function WalletBalanceSparkline({ values, width, height, color }: {
  values: number[];
  width: number;
  height: number;
  color: string;
}) {
  const theme = useVadTheme();
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
        <VadText variant="caption" style={{ color: '#C9D0FF', fontSize: 9, textAlign: 'right' }}>History builds from posted wallet activity</VadText>
      </View>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(1, Math.abs(max) * 0.04);
  const inset = 5;
  const innerHeight = height - inset * 2;
  const coords = values.map((value, index) => ({
    x: inset + (index / (values.length - 1)) * Math.max(1, width - inset * 2),
    y: inset + (1 - (value - min) / range) * innerHeight,
  }));
  return (
    <View style={{ width, height, position: 'relative', overflow: 'hidden' }}>
      {coords.slice(1).map((point, index) => {
        const previous = coords[index];
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              left: (previous.x + point.x) / 2 - length / 2,
              top: (previous.y + point.y) / 2 - 1.5,
              width: length,
              height: 3,
              borderRadius: 3,
              backgroundColor: color,
              transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
            }}
          />
        );
      })}
      <View style={{ position: 'absolute', right: 1, top: coords[coords.length - 1].y - 3, width: 7, height: 7, borderRadius: 4, backgroundColor: '#D2CFFF' }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.border, opacity: 0.25 }} />
    </View>
  );
}

function RecentWalletActivityRow({ row, onPress }: { row: WalletActivityRow; onPress: () => void }) {
  const theme = useVadTheme();
  const incoming = ledgerMovementIsIncoming(row);
  const title = ledgerMovementLabel(row.activity_type);
  const icon: VadIconName = row.activity_type === 'DEPOSIT' || row.activity_type === 'WITHDRAWAL'
    ? incoming ? 'arrowDown' : 'arrowUp'
    : row.activity_type.includes('SETTLEMENT') ? 'activity'
      : row.activity_type.includes('TRANSFER') ? 'transfer'
        : row.market_title ? 'activity' : 'fileText';
  const date = new Date(row.created_at);
  const timestamp = Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Recently';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${title.toLowerCase()} wallet record`}
      accessibilityHint="Opens complete wallet activity"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
    >
      <VadCard variant="raised" style={{ minHeight: 69, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: incoming ? 'rgba(24,214,163,0.14)' : theme.colors.brandSoft, flexShrink: 0 }}>
          <VadIcon name={icon} size={18} tone={incoming ? 'yes' : 'brand'} color={incoming ? '#18D6A3' : theme.colors.brandPrimary} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <VadText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 13.5 }}>{title}</VadText>
          <VadText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 11.5 }}>{row.market_title ?? row.description ?? row.asset_code}</VadText>
          <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ fontSize: 10.5 }}>{timestamp}</VadText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3, maxWidth: '40%' }}>
          <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit style={{ color: incoming ? '#18D6A3' : theme.colors.textPrimary, fontSize: 13 }}>
            {incoming ? '+' : '−'}{assetMoney(row.amount, row.asset_code)}
          </VadText>
          <VadText variant="caption" tone="tertiary" style={{ fontSize: 10.5 }}>{row.asset_code}</VadText>
        </View>
        <VadIcon name="chevronRight" size={16} tone="tertiary" />
      </VadCard>
    </Pressable>
  );
}

function ledgerMovementIsIncoming(row: WalletActivityRow) {
  if (row.account_type === 'USER_AVAILABLE') return row.direction === 'CREDIT';
  return ['ORDER_FEE_RESERVE_RELEASE', 'MARKET_CLOSE_ORDER_RELEASE'].includes(row.activity_type);
}

function ledgerMovementLabel(type: string) {
  const labels: Record<string, string> = {
    POOL_STAKE: 'Prediction Purchase',
    TRADING_FEE: 'Trading Fee',
    ORDER_RESERVE: 'Order Reserve',
    ORDER_FEE_RESERVE_RELEASE: 'Order Reserve Released',
    MARKET_CLOSE_ORDER_RELEASE: 'Order Funds Released',
    MARKET_SETTLEMENT: 'Prediction Payout',
    DEPOSIT: 'Deposit via Bank Transfer',
    WITHDRAWAL: 'Withdrawal',
    REFUND: 'Refund',
  };
  return labels[type] ?? type.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  tone: 'yes' | 'brand' | 'primary' | 'purple';
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const accent = tone === 'yes' ? '#14D5A0'
    : tone === 'brand' ? '#386AF4'
      : tone === 'purple' ? '#713EF2'
        : theme.colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabled ? `${detail}. Unavailable for this wallet currency.` : detail}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: disabled ? 0.42 : pressed ? 0.76 : 1, transform: [{ scale: pressed && !disabled ? 0.98 : 1 }] })}
    >
      <View style={{
        minHeight: density.phone ? 105 : 116,
        paddingHorizontal: density.phone ? 4 : 7,
        paddingVertical: 8,
        borderRadius: 17,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
      }}>
        <View style={{ width: density.phone ? 43 : 48, height: density.phone ? 43 : 48, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: tone === 'primary' ? theme.colors.surfaceMuted : accent }}>
          <VadIcon name={icon} size={density.phone ? 21 : 23} color={tone === 'primary' ? theme.colors.textSecondary : '#FFFFFF'} />
        </View>
        <VadText variant="label" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: density.phone ? 11.5 : 13, lineHeight: 16 }}>{label}</VadText>
        <VadText variant="caption" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: density.phone ? 9.5 : 11, lineHeight: 13, color: theme.colors.textTertiary }}>{detail}</VadText>
      </View>
    </Pressable>
  );
}

function assetRank(code: string) {
  if (code === 'NGN') return 0;
  if (code === 'USDC') return 1;
  return 10;
}
