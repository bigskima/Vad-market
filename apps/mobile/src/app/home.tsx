import { router } from 'expo-router';
import { View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { HomeScreen } from '@/features/home/home-screen';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
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
      router.push({
        pathname: '/markets',
        params: { category },
      });
      return;
    }

    router.push('/markets');
  };

  const marketReadFailedWithoutData = Boolean(
    data.sectionErrors.markets && !data.markets.length,
  );
  const walletReadFailedWithoutData = Boolean(
    data.sectionErrors.wallet && !data.ngn,
  );
  const homeReadBlocked =
    marketReadFailedWithoutData || walletReadFailedWithoutData;

  return (
    <ProductRoute active="Home" allowCreate>
      {homeReadBlocked ? (
        <View style={{ gap: theme.spacing.md }}>
          {marketReadFailedWithoutData ? (
            <VadErrorState
              title="Market pulse could not be loaded"
              message={data.sectionErrors.markets ?? 'Market data is unavailable.'}
              onRetry={() => void data.load()}
            />
          ) : null}
          {walletReadFailedWithoutData ? (
            <VadErrorState
              title="Wallet snapshot could not be loaded"
              message={data.sectionErrors.wallet ?? 'Wallet data is unavailable.'}
              onRetry={() => void data.load()}
            />
          ) : null}
        </View>
      ) : (
        <HomeScreen
          markets={data.markets}
          ngn={data.ngn}
          onOpenMarket={openMarket}
          onExploreMarkets={exploreMarkets}
          onOpenWallet={() => router.push('/wallet')}
          onOpenCommunity={() => router.push('/community')}
        />
      )}
    </ProductRoute>
  );
}
