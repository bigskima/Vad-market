import { PaymentReadinessCard } from '@/components/payment-readiness-card';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';

export default function DepositRoute() {
  const { session } = useAuth();
  const runtime = useRuntimeCapabilities(session);
  const reason = runtime.snapshot.reasons.deposit;

  return (
    <ProductSubpage title="Deposit NGN" maxWidth={980}>
      <PaymentReadinessCard
        initialMode="DEPOSIT"
        lockMode
        canOperate={runtime.snapshot.capabilities.deposit}
        capabilityReason={reason}
        capabilityLoading={
          runtime.isRefreshing && reason === 'CAPABILITIES_LOADING'
        }
      />
    </ProductSubpage>
  );
}
