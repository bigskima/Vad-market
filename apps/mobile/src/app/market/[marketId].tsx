import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { MarketDetailScreen } from '@/features/markets/market-detail-screen';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export default function MarketDetailRoute() {
  const params = useLocalSearchParams<{ marketId: string }>();
  const { session } = useAuth();
  const data = useProductDataContext();
  const theme = useVadTheme();
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
      {data.loading ? (
        <View style={{ gap: theme.spacing.md }}>
          <VadSkeleton width="62%" height={34} />
          <VadSkeleton height={148} radius={theme.radius.xl} />
          <VadSkeleton height={46} />
          <VadSkeleton height={118} />
        </View>
      ) : market ? (
        <MarketDetailScreen
          market={market}
          markets={data.markets}
          canTrade={runtime.snapshot.capabilities.trade}
          canCreatePost={runtime.snapshot.capabilities.createPost}
          onPlaced={data.load}
          onOpenMarket={openMarket}
        />
      ) : data.sectionErrors.markets ? (
        <VadErrorState
          title="Market could not be loaded"
          message={data.sectionErrors.markets}
          onRetry={() => void data.load()}
        />
      ) : (
        <VadEmptyState
          title="Market unavailable"
          body="This market is not in the current catalogue. It may be unpublished, unavailable in this jurisdiction or no longer accessible from this link."
        />
      )}
    </ProductSubpage>
  );
}
