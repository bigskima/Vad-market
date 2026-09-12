import { router } from 'expo-router';
import { View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { HomeScreen } from '@/features/home/home-screen';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { isSafeInternalRoute } from '@/services/home-content-api';
import type { MarketCatalogItem } from '@/services/market-api';

export default function HomeRoute() {
  const data = useProductDataContext();
  const theme = useVadTheme();

  const openMarket = (market: MarketCatalogItem) => {
    router.push({
      pathname: '/market/[marketId]',
      params: { marketId: market.instrument_public_id },
    });
  };

  const exploreMarkets = (category?: string) => {
    if (category) {
      router.push({ pathname: '/markets', params: { category } });
      return;
    }
    router.push('/markets');
  };

  const openPromotion = (targetPath: string) => {
    if (!isSafeInternalRoute(targetPath)) return;
    router.push(targetPath as never);
  };

  const marketReadFailedWithoutData = Boolean(data.sectionErrors.markets && !data.markets.length);

  return (
    <ProductRoute active="Home" allowCreate>
      {marketReadFailedWithoutData ? (
        <View style={{ gap: theme.spacing.md }}>
          <VadErrorState
            title="Markets could not be loaded"
            message={data.sectionErrors.markets ?? 'Market data is unavailable.'}
            onRetry={() => void data.load()}
          />
        </View>
      ) : (
        <HomeScreen
          markets={data.markets}
          promotions={data.homePromotions}
          vadMarkets={data.vadMarkets}
          featuredMarkets={data.featuredMarkets}
          trendingMarkets={data.trendingMarkets}
          featuredSettings={data.featuredMarketSettings}
          trendingSettings={data.trendingMarketSettings}
          onOpenMarket={openMarket}
          onOpenPromotion={openPromotion}
          onExploreMarkets={exploreMarkets}
          onOpenCommunity={() => router.push('/community')}
        />
      )}
    </ProductRoute>
  );
}
