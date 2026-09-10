import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminRevenueSnapshot } from '@/features/admin/finance/admin-revenue-snapshot';
import { AdminGovernanceScreen } from '@/features/admin/sections/admin-governance-screen';

export default function AdminGovernanceRoute() {
  return (
    <AdminPermissionGate permissions={['markets.manage', 'oracle.review']}>
      <AdminRouteContainer>
        <AdminGovernanceScreen />
        <AdminRevenueSnapshot
          title="Market-generated VAD revenue"
          description="Recognized trading and settlement fees from posted ledger activity. Market stakes, collateral and settlement funds are not VAD revenue."
          sourceCodes={['TRADING_FEES', 'SETTLEMENT_FEES']}
        />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
