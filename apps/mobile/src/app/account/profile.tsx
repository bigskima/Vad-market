import { ProfileEditorCard } from '@/components/profile/profile-editor-card';
import { ProductSubpage } from '@/features/navigation/product-subpage';

export default function AccountProfileScreen() {
  return (
    <ProductSubpage title="Profile">
      <ProfileEditorCard />
    </ProductSubpage>
  );
}
