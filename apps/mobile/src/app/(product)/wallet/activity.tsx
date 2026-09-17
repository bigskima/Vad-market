import { router } from 'expo-router';
import { View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { WalletActivityScreen } from '@/features/wallet/wallet-activity-screen';
import { WalletLedgerActivity } from '@/features/wallet/wallet-ledger-activity';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import type { PaymentIntentRow } from '@/services/payment-api';

export default function WalletActivityRoute() {
  const data = useProductDataContext();
  const theme = useVadTheme();
  const openTransaction = (intent: PaymentIntentRow) => {
    router.push({ pathname: '/wallet/transaction/[intentId]', params: { intentId: intent.intent_public_id } });
  };

  return (
    <ProductSubpage title="Wallet activity" maxWidth={1040}>
      <View style={{ gap: theme.spacing.xl }}>
        {data.sectionErrors.walletActivity && !data.walletActivity.length ? (
          <VadErrorState title="Wallet ledger could not be loaded" message={data.sectionErrors.walletActivity} onRetry={() => void data.refreshPortfolio()} />
        ) : (
          <WalletLedgerActivity rows={data.walletActivity} />
        )}
        <WalletActivityScreen onOpenTransaction={openTransaction} />
      </View>
    </ProductSubpage>
  );
}
