import { PaymentReadinessCard } from '@/components/payment-readiness-card';
import { ProductSubpage } from '@/features/navigation/product-subpage';

export default function DepositRoute() {
  return (
    <ProductSubpage title="Deposit NGN">
      <PaymentReadinessCard initialMode="DEPOSIT" lockMode />
    </ProductSubpage>
  );
}
