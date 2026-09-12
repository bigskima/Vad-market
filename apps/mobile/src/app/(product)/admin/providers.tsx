import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminProvidersScreen } from '@/features/admin/sections/admin-providers-screen';

export default function AdminProvidersRoute() {
  return (
    <AdminPermissionGate permissions={['providers.manage', 'finance.read']}>
      <AdminRouteContainer>
        <AdminProvidersScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
