import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminComplianceScreen } from '@/features/admin/sections/admin-compliance-screen';

export default function AdminComplianceRoute() {
  return (
    <AdminRouteContainer>
      <AdminComplianceScreen />
    </AdminRouteContainer>
  );
}
