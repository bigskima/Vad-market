import { ProfileEditorCard } from '@/components/profile/profile-editor-card';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { TourTarget } from '@/features/tour/tour-provider';

export default function AccountProfileScreen() {
  return (
    <ProductSubpage title="Public profile" maxWidth={1040}>
      <TourTarget id="profile-editor"><ProfileEditorCard /></TourTarget>
    </ProductSubpage>
  );
}
