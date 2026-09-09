import { router } from 'expo-router';

import { ProductSubpage } from '@/features/navigation/product-subpage';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export default function CommunityRoute() {
  const { session } = useAuth();
  const data = useProductDataContext();
  const runtime = useRuntimeCapabilities(session);

  const openMarket = (market: MarketCatalogItem) => {
    router.push({
      pathname: '/market/[marketId]',
      params: { marketId: market.instrument_public_id },
    });
  };

  return (
    <ProductSubpage title="Community">
      <SocialConvictionFeed
        markets={data.markets}
        canCreatePost={runtime.snapshot.capabilities.createPost}
        onOpenMarket={openMarket}
      />
    </ProductSubpage>
  );
}
