import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { TourTarget } from '@/features/tour/tour-provider';

import { VadCard } from '@/components/ui/vad-card';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { WalletLedgerSkeleton } from '@/components/ui/screen-skeletons';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { WalletLedgerActivity } from '@/features/wallet/wallet-ledger-activity';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function WalletActivityRoute() {
  const data = useProductDataContext();
  const theme = useVadTheme();

  return (
    <ProductSubpage title="Wallet activity" maxWidth={1040}>
      <TourTarget id="wallet-history">
        <View style={{ gap: theme.spacing.lg }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open deposits and withdrawals"
            onPress={() => router.push('/wallet/payment-activity')}
            style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
          >
            <VadCard variant="raised">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: theme.spacing.md }}>
                <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: theme.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <VadIcon name="transfer" size={20} tone="brand" />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <VadText variant="label">Deposits & withdrawals</VadText>
                  <VadText variant="caption" tone="secondary">Payment requests and transaction status</VadText>
                </View>
                <VadIcon name="chevronRight" size={18} tone="secondary" />
              </View>
            </VadCard>
          </Pressable>

          {data.loading && !data.walletActivity.length ? (
            <WalletLedgerSkeleton />
          ) : data.sectionErrors.walletActivity && !data.walletActivity.length ? (
            <VadErrorState title="Wallet ledger unavailable" message={data.sectionErrors.walletActivity} onRetry={() => void data.refreshPortfolio()} />
          ) : (
            <WalletLedgerActivity rows={data.walletActivity} />
          )}
        </View>
      </TourTarget>
    </ProductSubpage>
  );
}
