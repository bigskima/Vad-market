import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminMarketCreateWorkspace } from '@/features/admin/components/admin-market-create-workspace';

export default function AdminCreateMarketRoute() {
  return (
    <AdminPermissionGate permissions={['markets.manage']}>
      <AdminRouteContainer>
        <AdminMarketCreateWorkspace />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
