import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminContentScreen } from '@/features/admin/sections/admin-content-screen';

export default function AdminContentRoute() {
  return (
    <AdminRouteContainer>
      <AdminContentScreen />
    </AdminRouteContainer>
  );
}
