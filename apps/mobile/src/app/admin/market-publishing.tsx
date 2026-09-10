import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminMarketPublishingScreen } from '@/features/admin/governance/admin-market-publishing-screen';

export default function AdminMarketPublishingRoute() {
  return (
    <AdminPermissionGate permissions={['markets.manage']}>
      <AdminRouteContainer>
        <AdminMarketPublishingScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
