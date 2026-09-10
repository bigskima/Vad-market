import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminRolesScreen } from '@/features/admin/sections/admin-roles-screen';

export default function AdminRolesRoute() {
  return (
    <AdminPermissionGate permissions={['admin.roles.manage']}>
      <AdminRouteContainer>
        <AdminRolesScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
