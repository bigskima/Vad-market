import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminSuperAdminGate } from '@/features/admin/components/admin-super-admin-gate';
import { AdminServiceControlsScreen } from '@/features/admin/platform/admin-service-controls-screen';

export default function AdminServiceControlsRoute() {
  return (
    <AdminSuperAdminGate>
      <AdminRouteContainer>
        <AdminServiceControlsScreen />
      </AdminRouteContainer>
    </AdminSuperAdminGate>
  );
}
