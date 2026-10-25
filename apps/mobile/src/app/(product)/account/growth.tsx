import { ProductSubpage } from '@/features/navigation/product-subpage';
import { GrowthScreen } from '@/features/growth/growth-screen';
import { TourTarget } from '@/features/tour/tour-provider';

export default function AccountGrowthScreen() {
  return (
    <ProductSubpage title="Rewards & campaigns" maxWidth={1080}>
      <TourTarget id="growth-tools"><GrowthScreen /></TourTarget>
    </ProductSubpage>
  );
}
