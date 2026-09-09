import { useLocalSearchParams } from 'expo-router';

import { ProductSubpage } from '@/features/navigation/product-subpage';
import { CreatorProfileScreen } from '@/features/social/creator-profile-screen';

export default function CreatorRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  return (
    <ProductSubpage title="Creator">
      <CreatorProfileScreen creatorUserId={id ?? ''} />
    </ProductSubpage>
  );
}
