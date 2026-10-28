import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { TourTarget } from '@/features/tour/tour-provider';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadCard } from '@/components/ui/vad-card';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { WalletLedgerActivity } from '@/features/wallet/wallet-ledger-activity';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function WalletActivityRoute() {
  const data = useProductDataContext();
  const theme = useVadTheme();
  const hasNgn = data.activeAssetCodes.includes('NGN');

  if (!hasNgn) return <Redirect href="/wallet" />;

  return (
    <ProductSubpage title="Wallet activity" maxWidth={1040}>
      <TourTarget id="wallet-history">
      <View style={{ gap: theme.spacing.xl }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open deposits and withdrawals"
          onPress={() => router.push('/wallet/deposits-withdrawals')}
        >
          <VadCard variant="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft }}>
              <VadIcon name="transfer" size={21} tone="brand" />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <VadText variant="bodyStrong">Deposits & withdrawals</VadText>
              <VadText variant="caption" tone="secondary">Payment requests and their status</VadText>
            </View>
            <VadIcon name="chevronRight" size={18} tone="tertiary" />
          </VadCard>
        </Pressable>
        {data.sectionErrors.walletActivity && !data.walletActivity.length ? (
          <VadErrorState title="Wallet ledger could not be loaded" message={data.sectionErrors.walletActivity} onRetry={() => void data.refreshPortfolio()} />
        ) : (
          <WalletLedgerActivity rows={data.walletActivity} />
        )}
      </View>
      </TourTarget>
    </ProductSubpage>
  );
}
