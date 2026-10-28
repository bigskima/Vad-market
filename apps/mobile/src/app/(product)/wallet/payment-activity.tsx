import { router } from 'expo-router';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { WalletActivityScreen } from '@/features/wallet/wallet-activity-screen';
import type { PaymentIntentRow } from '@/services/payment-api';

export default function WalletPaymentActivityRoute() {
  const openTransaction = (intent: PaymentIntentRow) => {
    router.push({ pathname: '/wallet/transaction/[intentId]', params: { intentId: intent.intent_public_id } });
  };

  return (
    <ProductSubpage title="Deposits & withdrawals" maxWidth={1040}>
      <WalletActivityScreen onOpenTransaction={openTransaction} />
    </ProductSubpage>
  );
}
