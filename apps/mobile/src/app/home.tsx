import { router } from 'expo-router';

import { HomeScreen } from '@/features/home/home-screen';
import { ProductRoute } from '@/features/navigation/product-route';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export default function HomeRoute() {
  const { session } = useAuth();
  const data = useProductDataContext();
  const runtime = useRuntimeCapabilities(session);

  const openMarket = (market: MarketCatalogItem) => {
    router.push({ pathname: '/market/[marketId]', params: { marketId: market.instrument_public_id } });
  };

  return (
    <ProductRoute active="Home" allowCreate>
      <HomeScreen
        markets={data.markets}
        ngn={data.ngn}
        canCreatePost={runtime.snapshot.capabilities.createPost}
        onOpenMarket={openMarket}
        onExploreMarkets={() => router.push('/markets')}
        onOpenWallet={() => router.push('/wallet')}
      />
    </ProductRoute>
  );
}
