import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminMarketDiscoveryScreen } from '@/features/admin/governance/admin-market-discovery-screen';

export default function AdminMarketDiscoveryRoute() {
  return (
    <AdminPermissionGate permissions={['markets.manage']}>
      <AdminRouteContainer>
        <AdminMarketDiscoveryScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
