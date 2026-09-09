import { router, useLocalSearchParams } from 'expo-router';

import { ProductSubpage } from '@/features/navigation/product-subpage';
import { PortfolioOrderScreen } from '@/features/portfolio/portfolio-order-screen';

export default function PortfolioOrderRoute() {
  const params = useLocalSearchParams<{ orderId: string }>();
  const orderId = Array.isArray(params.orderId)
    ? params.orderId[0]
    : params.orderId;

  return (
    <ProductSubpage title="Order" maxWidth={900}>
      <PortfolioOrderScreen
        orderId={orderId ?? ''}
        onCancelled={() => router.replace('/portfolio')}
      />
    </ProductSubpage>
  );
}
