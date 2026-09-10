import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminPaymentsScreen } from '@/features/admin/sections/admin-payments-screen';

export default function AdminPaymentsRoute() {
  return (
    <AdminPermissionGate permissions={['finance.read', 'payments.refund']}>
      <AdminRouteContainer>
        <AdminPaymentsScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
