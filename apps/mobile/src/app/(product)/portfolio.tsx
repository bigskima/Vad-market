import { router } from 'expo-router';

import { ProductRoute } from '@/features/navigation/product-route';
import { PortfolioScreen } from '@/features/portfolio/portfolio-screen';
import { useProductDataContext } from '@/providers/product-data-provider';
import type { PositionRow } from '@/services/market-api';

export default function PortfolioRoute() {
  const data = useProductDataContext();

  const openPosition = (position: PositionRow) => {
    router.push({ pathname: '/portfolio/position/[instrumentId]', params: { instrumentId: String(position.instrument_id), outcome: position.outcome_code } });
  };

  const openOrder = (order: { order_id: string }) => {
    router.push({ pathname: '/portfolio/order/[orderId]', params: { orderId: String(order.order_id) } });
  };

  const openMarket = (marketId: string) => {
    router.push({ pathname: '/market/[marketId]', params: { marketId } });
  };

  return (
    <ProductRoute active="Portfolio" hideTopBar>
      <PortfolioScreen
        positions={data.positions}
        poolStakes={data.poolStakes}
        orders={data.orders}
        settlements={data.settlements}
        marketHistory={data.marketHistory}
        markets={data.markets}
        sectionErrors={data.sectionErrors}
        loading={data.loading}
        onRetry={() => void data.refreshPortfolio()}
        onOpenPosition={openPosition}
        onOpenOrder={openOrder}
        onOpenMarket={openMarket}
      />
    </ProductRoute>
  );
}
