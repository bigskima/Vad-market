import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminFeeControlsScreen } from '@/features/admin/finance/admin-fee-controls-screen';

export default function AdminFeeControlsRoute() {
  return (
    <AdminPermissionGate permissions={['fees.propose', 'policies.manage']}>
      <AdminRouteContainer>
        <AdminFeeControlsScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
