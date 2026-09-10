import { router } from 'expo-router';
import { View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { ProductRoute } from '@/features/navigation/product-route';
import { PortfolioScreen } from '@/features/portfolio/portfolio-screen';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import type { OrderRow, PositionRow } from '@/services/market-api';

export default function PortfolioRoute() {
  const data = useProductDataContext();
  const theme = useVadTheme();

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

  const positionsReadFailedWithoutData = Boolean(
    data.sectionErrors.positions && !data.positions.length,
  );
  const ordersReadFailedWithoutData = Boolean(
    data.sectionErrors.orders && !data.orders.length,
  );
  const portfolioReadBlocked =
    positionsReadFailedWithoutData || ordersReadFailedWithoutData;

  return (
    <ProductRoute
      active="Portfolio"
      requiredCapability="viewPortfolio"
      capabilityTitle="Portfolio is not enabled yet"
    >
      {portfolioReadBlocked ? (
        <View style={{ gap: theme.spacing.md }}>
          {positionsReadFailedWithoutData ? (
            <VadErrorState
              title="Positions could not be loaded"
              message={
                data.sectionErrors.positions ?? 'Position data is unavailable.'
              }
              onRetry={() => void data.load()}
            />
          ) : null}
          {ordersReadFailedWithoutData ? (
            <VadErrorState
              title="Open orders could not be loaded"
              message={data.sectionErrors.orders ?? 'Order data is unavailable.'}
              onRetry={() => void data.load()}
            />
          ) : null}
        </View>
      ) : (
        <PortfolioScreen
          positions={data.positions}
          orders={data.orders}
          onOpenPosition={openPosition}
          onOpenOrder={openOrder}
        />
      )}
    </ProductRoute>
  );
}
