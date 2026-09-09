import { router } from 'expo-router';

import { ProductRoute } from '@/features/navigation/product-route';
import { PortfolioScreen } from '@/features/portfolio/portfolio-screen';
import { useProductDataContext } from '@/providers/product-data-provider';
import type { OrderRow, PositionRow } from '@/services/market-api';

export default function PortfolioRoute() {
  const data = useProductDataContext();

  const openPosition = (position: PositionRow) => {
    router.push({
      pathname: '/portfolio/position/[instrumentId]',
      params: {
        instrumentId: String(position.instrument_id),
        outcome: position.outcome_code,
      },
    });
  };

  const openOrder = (order: OrderRow) => {
    router.push({
      pathname: '/portfolio/order/[orderId]',
      params: { orderId: String(order.order_id) },
    });
  };

  return (
    <ProductRoute active="Portfolio">
      <PortfolioScreen
        positions={data.positions}
        orders={data.orders}
        onOpenPosition={openPosition}
        onOpenOrder={openOrder}
      />
    </ProductRoute>
  );
}
