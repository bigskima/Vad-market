import { Redirect } from 'expo-router';
import { PaymentReadinessCard } from '@/components/payment-readiness-card';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { TourTarget } from '@/features/tour/tour-provider';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useCurrencyPreference } from '@/providers/currency-preference-provider';

export default function DepositRoute() {
  const { session } = useAuth();
  const runtime = useRuntimeCapabilities(session);
  const currencyPreference = useCurrencyPreference();
  const reason = runtime.snapshot.reasons.deposit;
  const hasNgn = runtime.snapshot.context.activeAssetCodes.includes('NGN') && currencyPreference.isCurrencyEnabled('NGN');

  if (!hasNgn) return <Redirect href="/wallet" />;

  return (
    <ProductSubpage title="Deposit" maxWidth={980}>
      <TourTarget id="wallet-deposit-form">
      <PaymentReadinessCard
        initialMode="DEPOSIT"
        lockMode
        canOperate={runtime.snapshot.capabilities.deposit}
        capabilityReason={reason}
        capabilityLoading={
          runtime.isRefreshing && reason === 'CAPABILITIES_LOADING'
        }
      />
      </TourTarget>
    </ProductSubpage>
  );
}
