import { router } from 'expo-router';

import { MarketsScreen } from '@/features/markets/markets-screen';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDataContext } from '@/providers/product-data-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export default function MarketsRoute() {
  const data = useProductDataContext();

  const openMarket = (market: MarketCatalogItem) => {
    router.push({ pathname: '/market/[marketId]', params: { marketId: market.instrument_public_id } });
  };

  return (
    <ProductRoute active="Markets" allowCreate>
      <MarketsScreen markets={data.markets} onOpenMarket={openMarket} />
    </ProductRoute>
  );
}
