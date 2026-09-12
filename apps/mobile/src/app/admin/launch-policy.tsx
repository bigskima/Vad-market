import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminLaunchPolicyScreen } from '@/features/admin/platform/admin-launch-policy-screen';

export default function AdminLaunchPolicyRoute() {
  return (
    <AdminPermissionGate permissions={['policies.manage', 'markets.manage', 'oracle.review', 'finance.read']}>
      <AdminRouteContainer>
        <AdminLaunchPolicyScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
