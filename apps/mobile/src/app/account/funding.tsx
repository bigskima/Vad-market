import { PaymentReadinessCard } from '@/components/payment-readiness-card';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';

export default function AccountFundingScreen() {
  return (
    <ProductSubpage title="Funding & withdrawals">
      <VadText tone="secondary">Inspect payment-provider readiness and preview live fees or capability requirements.</VadText>
      <PaymentReadinessCard />
    </ProductSubpage>
  );
}
