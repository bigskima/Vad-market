import { KycCard } from '@/components/kyc-card';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { TourTarget } from '@/features/tour/tour-provider';

export default function AccountVerificationScreen() {
  return (
    <ProductSubpage title="Identity verification" maxWidth={1040}>
      <TourTarget id="verification-details"><KycCard /></TourTarget>
    </ProductSubpage>
  );
}
