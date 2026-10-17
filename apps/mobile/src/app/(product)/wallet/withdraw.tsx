import { Redirect } from 'expo-router';
import { PaymentReadinessCard } from '@/components/payment-readiness-card';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useCurrencyPreference } from '@/providers/currency-preference-provider';

export default function WithdrawRoute() {
  const { session } = useAuth();
  const runtime = useRuntimeCapabilities(session);
  const currencyPreference = useCurrencyPreference();
  const reason = runtime.snapshot.reasons.withdraw;
  const hasNgn = runtime.snapshot.context.activeAssetCodes.includes('NGN') && currencyPreference.isCurrencyEnabled('NGN');

  if (!hasNgn) return <Redirect href="/wallet" />;

  return (
    <ProductSubpage title="Withdraw" maxWidth={980}>
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
