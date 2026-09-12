import { ProductSubpage } from '@/features/navigation/product-subpage';
import { GrowthScreen } from '@/features/growth/growth-screen';

export default function AccountGrowthScreen() {
  return (
    <ProductSubpage title="Rewards & campaigns" maxWidth={1080}>
      <GrowthScreen />
    </ProductSubpage>
  );
}
