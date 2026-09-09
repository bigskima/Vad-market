import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminProvidersScreen } from '@/features/admin/sections/admin-providers-screen';

export default function AdminProvidersRoute() {
  return (
    <AdminRouteContainer>
      <AdminProvidersScreen />
    </AdminRouteContainer>
  );
}
