import { router } from 'expo-router';
import { View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { ProductRoute } from '@/features/navigation/product-route';
import { PeerMarketPortfolio } from '@/features/portfolio/peer-market-portfolio';
import { PortfolioScreen } from '@/features/portfolio/portfolio-screen';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import type { PositionRow, OrderRow } from '@/services/market-api';

export default function PortfolioRoute() {
  const data = useProductDataContext();
  const theme = useVadTheme();

  const openPosition = (position: PositionRow) => {
    router.push({ pathname: '/portfolio/position/[instrumentId]', params: { instrumentId: String(position.instrument_id), outcome: position.outcome_code } });
  };

  const openOrder = (order: OrderRow) => {
    router.push({ pathname: '/portfolio/order/[orderId]', params: { orderId: String(order.order_id) } });
  };

  const peerReadFailed = Boolean(
    (data.sectionErrors.poolStakes && !data.poolStakes.length) ||
    (data.sectionErrors.marketHistory && !data.marketHistory.length),
  );

  return (
    <ProductRoute active="Portfolio">
      <View style={{ gap: theme.spacing.lg }}>
        <PortfolioScreen
          positions={data.positions}
          orders={data.orders}
          settlements={data.settlements}
          marketHistory={data.marketHistory}
          poolStakes={data.poolStakes}
          markets={data.markets}
          wallet={data.wallet}
          sectionErrors={data.sectionErrors}
          loading={data.loading}
          onRetry={() => void data.refreshPortfolio()}
          onOpenPosition={openPosition}
          onOpenOrder={openOrder}
        />
        {peerReadFailed ? (
          <VadErrorState
            title="Prediction cards could not be fully loaded"
            message={data.sectionErrors.poolStakes ?? data.sectionErrors.marketHistory ?? 'Prediction history is unavailable.'}
            onRetry={() => void data.refreshPortfolio()}
          />
        ) : (
          <PeerMarketPortfolio poolStakes={data.poolStakes} marketHistory={data.marketHistory} />
        )}
      </View>
    </ProductRoute>
  );
}
