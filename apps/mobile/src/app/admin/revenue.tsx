import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminRevenueScreen } from '@/features/admin/finance/admin-revenue-screen';

export default function AdminRevenueRoute() {
  return (
    <AdminPermissionGate permissions={['finance.read']}>
      <AdminRouteContainer>
        <AdminRevenueScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
