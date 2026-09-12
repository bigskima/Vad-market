import { useLocalSearchParams } from 'expo-router';

import { ProductSubpage } from '@/features/navigation/product-subpage';
import { PortfolioPositionScreen } from '@/features/portfolio/portfolio-position-screen';

export default function PortfolioPositionRoute() {
  const params = useLocalSearchParams<{ instrumentId: string; outcome?: string }>();
  const instrumentId = Array.isArray(params.instrumentId)
    ? params.instrumentId[0]
    : params.instrumentId;
  const outcome = Array.isArray(params.outcome) ? params.outcome[0] : params.outcome;

  return (
    <ProductSubpage title="Position" maxWidth={1040}>
      <PortfolioPositionScreen
        instrumentId={instrumentId ?? ''}
        outcomeCode={outcome ?? ''}
      />
    </ProductSubpage>
  );
}
