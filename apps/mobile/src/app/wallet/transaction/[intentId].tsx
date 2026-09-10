import { useLocalSearchParams } from 'expo-router';

import { ProductSubpage } from '@/features/navigation/product-subpage';
import { WalletTransactionScreen } from '@/features/wallet/wallet-transaction-screen';

export default function WalletTransactionRoute() {
  const params = useLocalSearchParams<{ intentId: string }>();
  const intentId = Array.isArray(params.intentId)
    ? params.intentId[0]
    : params.intentId;

  return (
    <ProductSubpage title="Transaction" maxWidth={1020}>
      <WalletTransactionScreen intentId={intentId ?? ''} />
    </ProductSubpage>
  );
}
