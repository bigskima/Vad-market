import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminAiScreen } from '@/features/admin/sections/admin-ai-screen';

export default function AdminAiRoute() {
  return (
    <AdminPermissionGate permissions={['providers.manage']}>
      <AdminRouteContainer>
        <AdminAiScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
