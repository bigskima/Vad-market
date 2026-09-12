import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminWorkQueueScreen } from '@/features/admin/command/admin-work-queue-screen';

export default function AdminQueueRoute() {
  return (
    <AdminRouteContainer>
      <AdminWorkQueueScreen />
    </AdminRouteContainer>
  );
}
