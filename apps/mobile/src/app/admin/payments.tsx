import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminRevenueSnapshot } from '@/features/admin/finance/admin-revenue-snapshot';
import { AdminPaymentsScreen } from '@/features/admin/sections/admin-payments-screen';

export default function AdminPaymentsRoute() {
  return (
    <AdminPermissionGate permissions={['finance.read', 'payments.refund']}>
      <AdminRouteContainer>
        <AdminPaymentsScreen />
        <AdminRevenueSnapshot
          title="Recognized payment fee revenue"
          description="Ledger-recognized payment-related fee income only. Fees shown on pending payment intents are quoted amounts, not VAD revenue."
          sourceCodes={['WITHDRAWAL_FEES']}
          showPlatformBalance
        />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
