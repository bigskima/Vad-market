import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminContentScreen } from '@/features/admin/sections/admin-content-screen';

export default function AdminContentRoute() {
  return (
    <AdminPermissionGate permissions={['content.moderate']}>
      <AdminRouteContainer>
        <AdminContentScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
