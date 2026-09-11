import { useLocalSearchParams } from 'expo-router';

import { ProductSubpage } from '@/features/navigation/product-subpage';
import { CreatorProfileScreen } from '@/features/social/creator-profile-screen';

export default function CreatorRoute() {
  const params = useLocalSearchParams<{ username: string }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  const cleanUsername = username?.replace(/^@+/, '') ?? '';

  return (
    <ProductSubpage title={cleanUsername ? `@${cleanUsername}` : 'Creator'} maxWidth={1040}>
      <CreatorProfileScreen username={cleanUsername} />
    </ProductSubpage>
  );
}
