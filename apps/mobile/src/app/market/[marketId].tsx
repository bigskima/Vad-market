import { useLocalSearchParams } from 'expo-router';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { MarketDetailHeader } from '@/features/markets/components/market-detail-header';
import { TradingTicket } from '@/features/markets/components/trading-ticket';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';

export default function MarketDetailRoute() {
  const params = useLocalSearchParams<{ marketId: string }>();
  const { session } = useAuth();
  const data = useProductDataContext();
  const runtime = useRuntimeCapabilities(session);
  const marketId = Array.isArray(params.marketId) ? params.marketId[0] : params.marketId;
  const market = data.markets.find((item) => item.instrument_public_id === marketId);

  return (
    <ProductSubpage title="Market">
      {market ? (
        <>
          <MarketDetailHeader market={market} />
          <TradingTicket
            market={market}
            canTrade={runtime.snapshot.capabilities.trade}
            onPlaced={data.load}
          />
        </>
      ) : (
        <VadEmptyState title="Market unavailable" body="This market could not be found in the current catalogue. Return to Markets and try again." />
      )}
    </ProductSubpage>
  );
}
