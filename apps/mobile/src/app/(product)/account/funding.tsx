import { FundingOverview } from '@/features/account/funding-overview';
import { TourTarget } from '@/features/tour/tour-provider';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';

export default function AccountFundingScreen() {
  const { session } = useAuth();
  const runtime = useRuntimeCapabilities(session);
  const depositReason = runtime.snapshot.reasons.deposit;
  const withdrawalReason = runtime.snapshot.reasons.withdraw;
  const policyLoading =
    runtime.isRefreshing &&
    (depositReason === 'CAPABILITIES_LOADING' ||
      withdrawalReason === 'CAPABILITIES_LOADING');

  return (
    <ProductSubpage title="Funding & withdrawals" maxWidth={900}>
      <TourTarget id="funding-overview">
      <FundingOverview
        depositAllowed={runtime.snapshot.capabilities.deposit}
        withdrawalAllowed={runtime.snapshot.capabilities.withdraw}
        depositReason={depositReason}
        withdrawalReason={withdrawalReason}
        policyLoading={policyLoading}
        activeAssetCodes={runtime.snapshot.context.activeAssetCodes}
      />
      </TourTarget>
    </ProductSubpage>
  );
}
