import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminGovernanceScreen } from '@/features/admin/sections/admin-governance-screen';

export default function AdminGovernanceRoute() {
  return (
    <AdminPermissionGate permissions={['markets.manage', 'oracle.review']}>
      <AdminRouteContainer>
        <AdminGovernanceScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
