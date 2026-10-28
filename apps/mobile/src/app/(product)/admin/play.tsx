import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminPlayScreen } from '@/features/admin/sections/admin-play-screen';

export default function AdminPlayRoute() {
  return (
    <AdminPermissionGate permissions={['play.manage']}>
      <AdminRouteContainer>
        <AdminPlayScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
