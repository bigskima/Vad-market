import { KycCard } from '@/components/kyc-card';
import { ProductSubpage } from '@/features/navigation/product-subpage';

export default function AccountVerificationScreen() {
  return (
    <ProductSubpage title="Verification" maxWidth={900}>
      <KycCard />
    </ProductSubpage>
  );
}
