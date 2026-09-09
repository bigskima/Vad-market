import { ProfileEditorCard } from '@/components/profile/profile-editor-card';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';

export default function AccountProfileScreen() {
  return (
    <ProductSubpage title="Profile">
      <VadText tone="secondary">Manage the public identity people see across VAD.</VadText>
      <ProfileEditorCard />
    </ProductSubpage>
  );
}
