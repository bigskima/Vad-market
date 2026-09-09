import { router } from 'expo-router';

import { ProductRoute } from '@/features/navigation/product-route';
import { WalletScreen } from '@/features/wallet/wallet-screen';
import { useProductDataContext } from '@/providers/product-data-provider';
import type { PaymentIntentRow } from '@/services/payment-api';

export default function WalletRoute() {
  const data = useProductDataContext();

  const openTransaction = (intent: PaymentIntentRow) => {
    router.push({
      pathname: '/wallet/transaction/[intentId]',
      params: { intentId: intent.intent_public_id },
    });
  };

  return (
    <ProductRoute active="Wallet">
      <WalletScreen
        ngn={data.ngn}
        onDeposit={() => router.push('/wallet/deposit')}
        onWithdraw={() => router.push('/wallet/withdraw')}
        onActivity={() => router.push('/wallet/activity')}
        onOpenTransaction={openTransaction}
      />
    </ProductRoute>
  );
}
