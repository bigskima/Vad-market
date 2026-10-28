import { ProductRoute } from '@/features/navigation/product-route';
import { PlayHubScreen } from '@/features/play/play-hub-screen';

export default function PlayRoute() {
  return (
    <ProductRoute active="Play" hideTopBar>
      <PlayHubScreen />
    </ProductRoute>
  );
}
