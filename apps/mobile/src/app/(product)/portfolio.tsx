import { router } from 'expo-router';
import { View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { ProductRoute } from '@/features/navigation/product-route';
import { PeerMarketPortfolio } from '@/features/portfolio/peer-market-portfolio';
import { PortfolioScreen } from '@/features/portfolio/portfolio-screen';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import type { OrderRow, PositionRow } from '@/services/market-api';

export default function PortfolioRoute() {
  const data = useProductDataContext();
  const theme = useVadTheme();

  const openPosition = (position: PositionRow) => {
    router.push({ pathname: '/portfolio/position/[instrumentId]', params: { instrumentId: String(position.instrument_id), outcome: position.outcome_code } });
  };

  const openOrder = (order: OrderRow) => {
    router.push({ pathname: '/portfolio/order/[orderId]', params: { orderId: String(order.order_id) } });
  };

  const positionsReadFailedWithoutData = Boolean(data.sectionErrors.positions && !data.positions.length);
  const ordersReadFailedWithoutData = Boolean(data.sectionErrors.orders && !data.orders.length);
  const settlementsReadFailedWithoutData = Boolean(data.sectionErrors.settlements && !data.settlements.length);
  const peerReadFailed = Boolean(
    (data.sectionErrors.poolStakes && !data.poolStakes.length) ||
    (data.sectionErrors.marketHistory && !data.marketHistory.length),
  );
  const portfolioReadBlocked = positionsReadFailedWithoutData || ordersReadFailedWithoutData;

  return (
    <ProductRoute active="Portfolio">
      <View style={{ gap: theme.spacing.lg }}>
        {peerReadFailed ? (
          <VadErrorState
            title="Prediction history could not be fully loaded"
            message={data.sectionErrors.poolStakes ?? data.sectionErrors.marketHistory ?? 'Prediction history is unavailable.'}
            onRetry={() => void data.refreshPortfolio()}
          />
        ) : (
          <PeerMarketPortfolio poolStakes={data.poolStakes} marketHistory={data.marketHistory} />
        )}

        {portfolioReadBlocked ? (
          <View style={{ gap: theme.spacing.md }}>
            {positionsReadFailedWithoutData ? <VadErrorState title="Positions could not be loaded" message={data.sectionErrors.positions ?? 'Position data is unavailable.'} onRetry={() => void data.refreshPortfolio()} /> : null}
            {ordersReadFailedWithoutData ? <VadErrorState title="Open orders could not be loaded" message={data.sectionErrors.orders ?? 'Order data is unavailable.'} onRetry={() => void data.refreshPortfolio()} /> : null}
          </View>
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {settlementsReadFailedWithoutData ? <VadErrorState title="Payout history could not be loaded" message={data.sectionErrors.settlements ?? 'Payout history is unavailable.'} onRetry={() => void data.refreshPortfolio()} /> : null}
            <PortfolioScreen positions={data.positions} orders={data.orders} settlements={data.settlements} onOpenPosition={openPosition} onOpenOrder={openOrder} />
          </View>
        )}
      </View>
    </ProductRoute>
  );
}
