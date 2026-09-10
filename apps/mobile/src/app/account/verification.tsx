import { KycCard } from '@/components/kyc-card';
import { ProductSubpage } from '@/features/navigation/product-subpage';

export default function AccountVerificationScreen() {
  return (
    <ProductSubpage title="Identity verification" maxWidth={1040}>
      <KycCard />
    </ProductSubpage>
  );
}
