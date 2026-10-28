import { ProductRoute } from '@/features/navigation/product-route';
import { PlayGamesScreen } from '@/features/play/play-games-screen';

export default function PlayGamesRoute() {
  return (
    <ProductRoute active="Play" hideTopBar>
      <PlayGamesScreen />
    </ProductRoute>
  );
}
