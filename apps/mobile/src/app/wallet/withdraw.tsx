import { PaymentReadinessCard } from '@/components/payment-readiness-card';
import { ProductSubpage } from '@/features/navigation/product-subpage';

export default function WithdrawRoute() {
  return (
    <ProductSubpage title="Withdraw NGN">
      <PaymentReadinessCard initialMode="WITHDRAWAL" lockMode />
    </ProductSubpage>
  );
}
