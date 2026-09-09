import { router } from 'expo-router';

import { ProductSubpage } from '@/features/navigation/product-subpage';
import { WalletActivityScreen } from '@/features/wallet/wallet-activity-screen';
import type { PaymentIntentRow } from '@/services/payment-api';

export default function WalletActivityRoute() {
  const openTransaction = (intent: PaymentIntentRow) => {
    router.push({
      pathname: '/wallet/transaction/[intentId]',
      params: { intentId: intent.intent_public_id },
    });
  };

  return (
    <ProductSubpage title="Wallet activity" maxWidth={900}>
      <WalletActivityScreen onOpenTransaction={openTransaction} />
    </ProductSubpage>
  );
}
