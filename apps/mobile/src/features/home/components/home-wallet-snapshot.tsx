import { Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useBalanceVisibility } from '@/hooks/use-balance-visibility';
import { useProductDensity } from '@/hooks/use-product-density';
import { useCurrencyPreference, type VADCurrency } from '@/providers/currency-preference-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { assetMoney } from '@/features/markets/format';
import type { WalletRow } from '@/services/market-api';

type QuickAction = {
  label: string;
  icon: VadIconName;
  onPress: () => void;
};

export function HomeWalletSnapshot({
  wallets,
  activeAssetCodes,
  walletError,
  onRetryWallet,
  onOpenWallet,
  onOpenDeposit,
  onOpenWithdraw,
  onExploreMarkets,
  onOpenPortfolio,
  onOpenCommunity,
}: {
  wallets: WalletRow[];
  activeAssetCodes: string[];
  walletError?: string | null;
  onRetryWallet: () => void;
  onOpenWallet: () => void;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onExploreMarkets: () => void;
  onOpenPortfolio: () => void;
  onOpenCommunity: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const currencyPreference = useCurrencyPreference();
  const { hidden, toggle } = useBalanceVisibility();

  const visibleWallets = wallets
    .filter((wallet) =>
      (wallet.asset_code === 'NGN' || wallet.asset_code === 'USDC') &&
      activeAssetCodes.includes(wallet.asset_code) &&
      currencyPreference.isCurrencyEligible(wallet.asset_code as VADCurrency) &&
      currencyPreference.isCurrencyEnabled(wallet.asset_code as VADCurrency),
    )
    .sort((a, b) => assetRank(a.asset_code) - assetRank(b.asset_code));
  const primary = visibleWallets.find((wallet) => wallet.asset_code === 'NGN') ?? visibleWallets[0] ?? null;
  const total = primary
    ? Number(primary.available ?? 0) + Number(primary.reserved ?? 0) + Number(primary.withdrawal_pending ?? 0)
    : 0;
  const hasNgn = activeAssetCodes.includes('NGN') && currencyPreference.isCurrencyEligible('NGN') && currencyPreference.isCurrencyEnabled('NGN');
  const hasVisibleCurrency = (['NGN', 'USDC'] as VADCurrency[]).some((currency) =>
    activeAssetCodes.includes(currency) && currencyPreference.isCurrencyEligible(currency) && currencyPreference.isCurrencyEnabled(currency),
  );

  const actions: QuickAction[] = hasNgn
    ? [
        { label: 'Deposit', icon: 'arrowDown', onPress: onOpenDeposit },
        { label: 'Withdraw', icon: 'arrowUp', onPress: onOpenWithdraw },
        { label: 'Markets', icon: 'markets', onPress: onExploreMarkets },
        { label: 'Wallet', icon: 'wallet', onPress: onOpenWallet },
      ]
    : [
        { label: 'Markets', icon: 'markets', onPress: onExploreMarkets },
        { label: 'Portfolio', icon: 'portfolio', onPress: onOpenPortfolio },
        { label: 'Community', icon: 'community', onPress: onOpenCommunity },
        { label: 'Wallet', icon: 'wallet', onPress: onOpenWallet },
      ];

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <VadCard
        variant="surface"
        style={{
          padding: density.phone ? theme.spacing.md : theme.spacing.lg,
          borderRadius: theme.radius.lg,
          gap: theme.spacing.sm,
        }}
      >
        {walletError && !visibleWallets.length ? (
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <VadIcon name="wallet" size={20} tone="secondary" />
              <View style={{ flex: 1, gap: 2 }}>
                <VadText variant="bodyStrong">Wallet balance unavailable</VadText>
                <VadText variant="caption" tone="secondary">We could not load your balances. Your market access is still available.</VadText>
              </View>
            </View>
            <VadButton label="Retry balance" variant="secondary" size="small" fullWidth={false} onPress={onRetryWallet} />
          </View>
        ) : !primary ? (
          <View style={{ gap: theme.spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <View style={{ flex: 1, gap: 2 }}>
                <VadText variant="caption" tone="brand">YOUR WALLET</VadText>
                <VadText variant="bodyStrong">Your balance will appear here</VadText>
                <VadText variant="caption" tone="secondary">{hasVisibleCurrency ? 'Your balance has not been returned yet. Open Wallet to review your account.' : 'Enable an eligible settlement currency in Wallet to show its balances here.'}</VadText>
              </View>
              <VadIcon name="wallet" size={22} tone="secondary" />
            </View>
            <VadButton label="Open wallet" variant="secondary" size="small" fullWidth={false} onPress={onOpenWallet} />
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <VadText variant="caption" tone="brand">WALLET AT A GLANCE</VadText>
                <VadText variant="caption" tone="secondary">Total {primary.asset_code} balance</VadText>
                <VadText
                  variant={density.phone ? 'title' : 'display'}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {hidden ? '••••••' : assetMoney(total, primary.asset_code)}
                </VadText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={hidden ? 'Show balances' : 'Hide balances'}
                accessibilityHint="Applies to balance amounts on Home and Wallet"
                onPress={toggle}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: theme.radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surfaceRaised,
                })}
              >
                <VadIcon name={hidden ? 'eyeOff' : 'eye'} size={18} tone="secondary" />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              <BalanceMetric label="Available" value={hidden ? '••••••' : assetMoney(primary.available, primary.asset_code)} positive />
              <BalanceMetric label="Reserved" value={hidden ? '••••••' : assetMoney(primary.reserved, primary.asset_code)} />
              <BalanceMetric label="Pending" value={hidden ? '••••••' : assetMoney(primary.withdrawal_pending, primary.asset_code)} />
            </View>
            {visibleWallets.filter((wallet) => wallet.asset_code !== primary.asset_code).map((wallet) => {
              const otherTotal = Number(wallet.available ?? 0) + Number(wallet.reserved ?? 0) + Number(wallet.withdrawal_pending ?? 0);
              return (
                <View key={wallet.asset_code} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm }}>
                  <View style={{ gap: 1 }}>
                    <VadText variant="caption" tone="secondary">{wallet.asset_code} balance</VadText>
                    <VadText variant="caption" tone="tertiary">Kept separate from {primary.asset_code}</VadText>
                  </View>
                  <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ['tabular-nums'] }}>
                    {hidden ? '••••••' : assetMoney(otherTotal, wallet.asset_code)}
                  </VadText>
                </View>
              );
            })}
            {walletError ? (
              <VadText variant="caption" tone="warning">Could not refresh the wallet. Showing the latest available balance data.</VadText>
            ) : null}
          </>
        )}
      </VadCard>

      <View style={{ flexDirection: 'row', gap: density.phone ? 5 : theme.spacing.sm }}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              minHeight: 68,
              paddingVertical: theme.spacing.xs,
              paddingHorizontal: 2,
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft }}>
              <VadIcon name={action.icon} size={17} tone="brand" />
            </View>
            <VadText variant="caption" numberOfLines={1}>{action.label}</VadText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function BalanceMetric({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  const theme = useVadTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
      <VadText variant="caption" tone={positive ? 'yes' : 'primary'} numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ['tabular-nums'] }}>{value}</VadText>
    </View>
  );
}

function assetRank(assetCode: string) {
  return assetCode === 'NGN' ? 0 : 1;
}
