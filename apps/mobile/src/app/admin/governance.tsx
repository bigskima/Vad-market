import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminGovernanceScreen } from '@/features/admin/sections/admin-governance-screen';

export default function AdminGovernanceRoute() {
  return (
    <AdminRouteContainer>
      <AdminGovernanceScreen />
    </AdminRouteContainer>
  );
}
