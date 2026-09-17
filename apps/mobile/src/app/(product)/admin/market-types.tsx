import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminMarketTypesWorkspace } from '@/features/admin/components/admin-market-types-workspace';

export default function AdminMarketTypesRoute() {
  return (
    <AdminPermissionGate permissions={['markets.manage']}>
      <AdminRouteContainer>
        <AdminMarketTypesWorkspace />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
