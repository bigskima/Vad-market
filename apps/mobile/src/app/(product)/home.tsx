import { router } from 'expo-router';
import { HomeScreen } from '@/features/home/home-screen';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useAuth } from '@/providers/auth-provider';
import { isSafeInternalRoute } from '@/services/home-content-api';
import type { MarketCatalogItem } from '@/services/market-api';

export default function HomeRoute() {
  const data = useProductDataContext();
  const { session } = useAuth();
  const metadata = session?.user.user_metadata ?? {};
  const userName = String(metadata.first_name ?? metadata.given_name ?? metadata.name ?? metadata.full_name ?? session?.user.email?.split('@')[0] ?? 'VAD member').trim().split(/\s+/)[0];

  const openMarket = (market: MarketCatalogItem) => {
    router.push({
      pathname: '/market/[marketId]',
      params: { marketId: market.instrument_public_id },
    });
  };

  const exploreMarkets = (category?: string) => {
    if (category === 'watchlist') {
      router.push('/watchlist');
      return;
    }
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

  return (
    <ProductRoute active="Home" allowCreate hideTopBar>
      <HomeScreen
        markets={data.markets}
        loading={data.loading}
        wallets={data.wallet}
        userName={userName}
        userId={session?.user.id ?? ''}
        hasUnreadNotifications={data.notifications.some((notification) => !notification.read_at)}
        promotions={data.homePromotions}
        trendingMarkets={data.trendingMarkets}
        trendingSettings={data.trendingMarketSettings}
        marketError={data.sectionErrors.markets ?? null}
        onRetryMarkets={() => void data.load()}
        onOpenMarket={openMarket}
        onOpenPromotion={openPromotion}
        onExploreMarkets={exploreMarkets}
        onNotifications={() => router.push('/notifications')}
        onDeposit={() => router.push('/wallet/deposit')}
        onWithdraw={() => router.push('/wallet/withdraw')}
        onSend={() => router.push('/wallet/send')}
        onOpenCryptoAssets={() => router.push('/financial-markets')}
      />
    </ProductRoute>
  );
}
