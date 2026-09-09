import { ProposalScreen } from '@/features/proposals/proposal-screen';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';

export default function CreateMarketRoute() {
  const { session } = useAuth();
  const data = useProductDataContext();
  const runtime = useRuntimeCapabilities(session);

  return (
    <ProductSubpage title="Propose a market">
      <ProposalScreen
        proposals={data.proposals}
        canSubmitProposal={runtime.snapshot.capabilities.submitMarketProposal}
        onReload={data.load}
      />
    </ProductSubpage>
  );
}
