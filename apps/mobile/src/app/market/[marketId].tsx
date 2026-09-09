import { router, useLocalSearchParams } from 'expo-router';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { MarketDetailScreen } from '@/features/markets/market-detail-screen';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export default function MarketDetailRoute() {
  const params = useLocalSearchParams<{ marketId: string }>();
  const { session } = useAuth();
  const data = useProductDataContext();
  const runtime = useRuntimeCapabilities(session);
  const marketId = Array.isArray(params.marketId)
    ? params.marketId[0]
    : params.marketId;
  const market = data.markets.find(
    (item) => item.instrument_public_id === marketId,
  );

  const openMarket = (next: MarketCatalogItem) => {
    router.replace({
      pathname: '/market/[marketId]',
      params: { marketId: next.instrument_public_id },
    });
  };

  return (
    <ProductSubpage title="Market" maxWidth={980}>
      {market ? (
        <MarketDetailScreen
          market={market}
          markets={data.markets}
          canTrade={runtime.snapshot.capabilities.trade}
          canCreatePost={runtime.snapshot.capabilities.createPost}
          onPlaced={data.load}
          onOpenMarket={openMarket}
        />
      ) : (
        <VadEmptyState
          title="Market unavailable"
          body="This market could not be found in the current catalogue. Return to Markets and try again."
        />
      )}
    </ProductSubpage>
  );
}
