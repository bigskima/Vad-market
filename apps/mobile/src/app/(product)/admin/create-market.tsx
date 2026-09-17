import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminMarketCreateWorkspaceCatalog } from '@/features/admin/components/admin-market-create-workspace-catalog';

export default function AdminCreateMarketRoute() {
  return (
    <AdminPermissionGate permissions={['markets.manage']}>
      <AdminRouteContainer>
        <AdminMarketCreateWorkspaceCatalog />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
