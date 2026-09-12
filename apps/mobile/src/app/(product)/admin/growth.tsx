import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminGrowthScreen } from '@/features/admin/growth/admin-growth-screen';

export default function AdminGrowthRoute() {
  return (
    <AdminPermissionGate permissions={['growth.read', 'growth.manage', 'growth.review', 'growth.finance']}>
      <AdminRouteContainer>
        <AdminGrowthScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
