import { router } from 'expo-router';

import { VadErrorState } from '@/components/ui/vad-error-state';
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

  const walletReadFailedWithoutData = Boolean(
    data.sectionErrors.wallet && !data.wallet.length,
  );

  return (
    <ProductRoute active="Wallet">
      {walletReadFailedWithoutData ? (
        <VadErrorState
          title="Wallet balance could not be loaded"
          message={data.sectionErrors.wallet ?? 'Wallet data is unavailable.'}
          onRetry={() => void data.load()}
        />
      ) : (
        <WalletScreen
          wallets={data.wallet}
          onDeposit={() => router.push('/wallet/deposit')}
          onWithdraw={() => router.push('/wallet/withdraw')}
          onActivity={() => router.push('/wallet/activity')}
          onOpenTransaction={openTransaction}
        />
      )}
    </ProductRoute>
  );
}
