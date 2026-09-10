import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminSearchScreen } from '@/features/admin/command/admin-search-screen';

export default function AdminSearchRoute() {
  return (
    <AdminRouteContainer>
      <AdminSearchScreen />
    </AdminRouteContainer>
  );
}
