import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminDashboardScreen } from '@/features/admin/dashboard/admin-dashboard-screen';

export default function AdminDashboardRoute() {
  return (
    <AdminRouteContainer>
      <AdminDashboardScreen />
    </AdminRouteContainer>
  );
}
