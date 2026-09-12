import { router, useLocalSearchParams } from 'expo-router';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { MarketsScreen } from '@/features/markets/markets-screen';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDataContext } from '@/providers/product-data-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export default function MarketsRoute() {
  const data = useProductDataContext();
  const params = useLocalSearchParams<{ category?: string | string[] }>();

  const initialCategory =
    typeof params.category === 'string'
      ? params.category
      : Array.isArray(params.category)
        ? params.category[0]
        : undefined;

  const openMarket = (market: MarketCatalogItem) => {
    router.push({
      pathname: '/market/[marketId]',
      params: { marketId: market.instrument_public_id },
    });
  };

  const marketReadFailedWithoutData = Boolean(
    data.sectionErrors.markets && !data.markets.length,
  );

  return (
    <ProductRoute active="Markets" allowCreate>
      {marketReadFailedWithoutData ? (
        <VadErrorState
          title="Markets could not be loaded"
          message={data.sectionErrors.markets ?? 'Market data is unavailable.'}
          onRetry={() => void data.load()}
        />
      ) : (
        <MarketsScreen
          markets={data.markets}
          onOpenMarket={openMarket}
          initialCategory={initialCategory}
        />
      )}
    </ProductRoute>
  );
}
