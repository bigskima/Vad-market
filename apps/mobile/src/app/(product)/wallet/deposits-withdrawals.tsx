import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { ProductSubpage } from '@/features/navigation/product-subpage';
import { TourTarget } from '@/features/tour/tour-provider';
import { WalletActivityScreen } from '@/features/wallet/wallet-activity-screen';
import { useProductDataContext } from '@/providers/product-data-provider';
import type { PaymentIntentRow } from '@/services/payment-api';

export default function WalletDepositsWithdrawalsRoute() {
  const data = useProductDataContext();
  if (!data.activeAssetCodes.includes('NGN')) return <Redirect href="/wallet" />;

  const openTransaction = (intent: PaymentIntentRow) => {
    router.push({ pathname: '/wallet/transaction/[intentId]', params: { intentId: intent.intent_public_id } });
  };

  return (
    <ProductSubpage title="Deposits & withdrawals" maxWidth={1040}>
      <TourTarget id="wallet-deposits-withdrawals">
        <View style={{ gap: 16 }}>
          <WalletActivityScreen onOpenTransaction={openTransaction} />
        </View>
      </TourTarget>
    </ProductSubpage>
  );
}
