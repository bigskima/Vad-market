import { ProductSubpage } from '@/features/navigation/product-subpage';
import { WalletActivityScreen } from '@/features/wallet/wallet-activity-screen';

export default function WalletActivityRoute() {
  return (
    <ProductSubpage title="Wallet activity">
      <WalletActivityScreen />
    </ProductSubpage>
  );
}
