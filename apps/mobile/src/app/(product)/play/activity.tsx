import { ProductRoute } from '@/features/navigation/product-route';
import { PlayActivityScreen } from '@/features/play/play-activity-screen';

export default function PlayActivityRoute() {
  return (
    <ProductRoute active="Play" hideTopBar>
      <PlayActivityScreen />
    </ProductRoute>
  );
}
