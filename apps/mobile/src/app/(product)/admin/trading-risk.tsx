import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminTradingRiskScreen } from '@/features/admin/finance/admin-trading-risk-screen';

export default function AdminTradingRiskRoute() {
  return (
    <AdminPermissionGate permissions={['policies.manage']}>
      <AdminRouteContainer>
        <AdminTradingRiskScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
