import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminUsersScreen } from '@/features/admin/sections/admin-users-screen';

export default function AdminUsersRoute() {
  return (
    <AdminRouteContainer>
      <AdminUsersScreen />
    </AdminRouteContainer>
  );
}
