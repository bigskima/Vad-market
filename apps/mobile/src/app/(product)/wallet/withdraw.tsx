import { PaymentReadinessCard } from '@/components/payment-readiness-card';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';

export default function WithdrawRoute() {
  const { session } = useAuth();
  const runtime = useRuntimeCapabilities(session);
  const reason = runtime.snapshot.reasons.withdraw;

  return (
    <ProductSubpage title="Withdraw NGN" maxWidth={980}>
      <PaymentReadinessCard
        initialMode="WITHDRAWAL"
        lockMode
        canOperate={runtime.snapshot.capabilities.withdraw}
        capabilityReason={reason}
        capabilityLoading={
          runtime.isRefreshing && reason === 'CAPABILITIES_LOADING'
        }
      />
    </ProductSubpage>
  );
}
