import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminUsersScreen } from '@/features/admin/sections/admin-users-screen';

export default function AdminUsersRoute() {
  return (
    <AdminPermissionGate permissions={['users.manage', 'support.read', 'admin.roles.manage']}>
      <AdminRouteContainer>
        <AdminUsersScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
