import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminHomeContentScreen } from '@/features/admin/content/admin-home-content-screen';

export default function AdminHomeContentRoute() {
  return (
    <AdminPermissionGate permissions={['content.moderate']}>
      <AdminRouteContainer>
        <AdminHomeContentScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
