import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminComplianceScreen } from '@/features/admin/sections/admin-compliance-screen';

export default function AdminComplianceRoute() {
  return (
    <AdminPermissionGate permissions={['compliance.manage', 'support.read']}>
      <AdminRouteContainer>
        <AdminComplianceScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
