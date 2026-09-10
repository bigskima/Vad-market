import { ProposalScreen } from '@/features/proposals/proposal-screen';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';

export default function CreateMarketRoute() {
  const { session } = useAuth();
  const data = useProductDataContext();
  const runtime = useRuntimeCapabilities(session);
  const capabilityReason = runtime.snapshot.reasons.submitMarketProposal;

  return (
    <ProductSubpage title="Propose a market" maxWidth={1040}>
      <ProposalScreen
        proposals={data.proposals}
        canSubmitProposal={runtime.snapshot.capabilities.submitMarketProposal}
        capabilityReason={capabilityReason}
        capabilityLoading={
          runtime.isRefreshing && capabilityReason === 'CAPABILITIES_LOADING'
        }
        historyLoading={data.loading}
        historyError={data.sectionErrors.proposals}
        onReload={data.load}
      />
    </ProductSubpage>
  );
}
