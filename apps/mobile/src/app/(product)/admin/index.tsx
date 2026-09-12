import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminDashboardScreen } from '@/features/admin/dashboard/admin-dashboard-screen';
import { AdminRevenueSnapshot } from '@/features/admin/finance/admin-revenue-snapshot';

export default function AdminDashboardRoute() {
  return (
    <AdminRouteContainer>
      <AdminDashboardScreen />
      <AdminRevenueSnapshot
        title="VAD revenue vs platform balance"
        description="Recognized VAD fee income is shown separately from operational funds held across wallets, collateral, pending, clearing and treasury accounts."
        showPlatformBalance
      />
    </AdminRouteContainer>
  );
}
