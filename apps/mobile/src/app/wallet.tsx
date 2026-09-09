import { router } from 'expo-router';

import { ProductRoute } from '@/features/navigation/product-route';
import { WalletScreen } from '@/features/wallet/wallet-screen';
import { useProductDataContext } from '@/providers/product-data-provider';

export default function WalletRoute() {
  const data = useProductDataContext();

  return (
    <ProductRoute active="Wallet">
      <WalletScreen
        ngn={data.ngn}
        onDeposit={() => router.push('/wallet/deposit')}
        onWithdraw={() => router.push('/wallet/withdraw')}
        onActivity={() => router.push('/wallet/activity')}
      />
    </ProductRoute>
  );
}
