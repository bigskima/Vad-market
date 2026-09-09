import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminPaymentsScreen } from '@/features/admin/sections/admin-payments-screen';

export default function AdminPaymentsRoute() {
  return (
    <AdminRouteContainer>
      <AdminPaymentsScreen />
    </AdminRouteContainer>
  );
}
