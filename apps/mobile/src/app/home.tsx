import { router } from 'expo-router';

import { HomeScreen } from '@/features/home/home-screen';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDataContext } from '@/providers/product-data-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export default function HomeRoute() {
  const data = useProductDataContext();

  const openMarket = (market: MarketCatalogItem) => {
    router.push({
      pathname: '/market/[marketId]',
      params: { marketId: market.instrument_public_id },
    });
  };

  return (
    <ProductRoute active="Home" allowCreate>
      <HomeScreen
        markets={data.markets}
        ngn={data.ngn}
        onOpenMarket={openMarket}
        onExploreMarkets={() => router.push('/markets')}
        onOpenWallet={() => router.push('/wallet')}
        onOpenCommunity={() => router.push('/community')}
      />
    </ProductRoute>
  );
}
