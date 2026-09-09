import { ProductRoute } from '@/features/navigation/product-route';
import { PortfolioScreen } from '@/features/portfolio/portfolio-screen';
import { useProductDataContext } from '@/providers/product-data-provider';

export default function PortfolioRoute() {
  const data = useProductDataContext();

  return (
    <ProductRoute active="Portfolio">
      <PortfolioScreen positions={data.positions} orders={data.orders} />
    </ProductRoute>
  );
}
