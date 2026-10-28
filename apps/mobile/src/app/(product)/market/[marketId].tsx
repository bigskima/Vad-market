import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { ProductScreenSkeleton } from '@/components/ui/product-screen-skeleton';
import { MarketDetailScreen } from '@/features/markets/market-detail-screen';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export default function MarketDetailRoute() {
  const params = useLocalSearchParams<{ marketId: string; outcome?: string; tourSection?: string }>();
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
  const tradeReason = runtime.snapshot.reasons.trade;
  const initialOutcome = params.outcome === 'YES' || params.outcome === 'NO' ? params.outcome : undefined;
  const initialTab = params.tourSection === 'Trade' ? 'Trade' : 'Overview';

  const openMarket = (next: MarketCatalogItem) => {
    router.replace({
      pathname: '/market/[marketId]',
      params: { marketId: next.instrument_public_id },
    });
  };

  const refreshAfterTrade = async () => {
    await Promise.all([data.refreshPortfolio(), data.refreshMarkets()]);
  };

  return (
    <ProductSubpage title="Market" maxWidth={980} bottomPadding={280}>
      {data.loading ? (
        <ProductScreenSkeleton variant="marketDetail" />
      ) : market ? (
        <View style={{ gap: theme.spacing.md }}>
          <MarketDetailScreen
            key={`${market.instrument_public_id}:${initialOutcome ?? 'default'}`}
            market={market}
            markets={data.markets}
            positions={data.positions}
            poolStakes={data.poolStakes}
            initialOutcome={initialOutcome}
            initialTab={initialTab}
            canTrade={runtime.snapshot.capabilities.trade}
            tradeReason={tradeReason}
            tradeCapabilityLoading={
              runtime.isRefreshing && tradeReason === 'CAPABILITIES_LOADING'
            }
            canCreatePost={runtime.snapshot.capabilities.createPost}
            onPlaced={refreshAfterTrade}
            onOpenMarket={openMarket}
            onRefreshMarket={data.refreshMarkets}
          />
        </View>
      ) : data.sectionErrors.markets ? (
        <VadErrorState
          title="Market could not be loaded"
          message={data.sectionErrors.markets}
          onRetry={() => void data.refreshMarkets()}
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
