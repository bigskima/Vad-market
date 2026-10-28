import { ProductRoute } from '@/features/navigation/product-route';
import { PlayExperienceDetailScreen } from '@/features/play/play-experience-detail-screen';

export default function PlayExperienceRoute() {
  return (
    <ProductRoute active="Play" hideTopBar>
      <PlayExperienceDetailScreen />
    </ProductRoute>
  );
}
