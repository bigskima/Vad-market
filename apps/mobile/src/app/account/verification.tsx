import { KycCard } from '@/components/kyc-card';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';

export default function AccountVerificationScreen() {
  return (
    <ProductSubpage title="Verification">
      <VadText tone="secondary">Review your identity status and continue verification when required by live policy.</VadText>
      <KycCard />
    </ProductSubpage>
  );
}
