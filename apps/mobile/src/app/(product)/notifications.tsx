import { router } from 'expo-router';

import { ProductSubpage } from '@/features/navigation/product-subpage';
import { NotificationsScreen } from '@/features/notifications/notifications-screen';
import { useProductDataContext } from '@/providers/product-data-provider';
import type { UserNotificationRow } from '@/services/notification-api';

export default function NotificationsRoute() {
  const data = useProductDataContext();

  function openNotification(notification: UserNotificationRow) {
    if (!notification.read_at) void data.markNotificationRead(notification.public_id);
    if (notification.market_public_id) {
      router.push({
        pathname: '/market/[marketId]',
        params: { marketId: notification.market_public_id },
      });
      return;
    }
    if (notification.notification_type.includes('PAYOUT') || notification.notification_type.includes('SETTLEMENT')) {
      router.push('/portfolio');
    }
  }

  return (
    <ProductSubpage title="Notifications" maxWidth={820}>
      <NotificationsScreen
        notifications={data.notifications}
        error={data.sectionErrors.notifications}
        onOpen={openNotification}
        onMarkRead={(notification) => void data.markNotificationRead(notification.public_id)}
        onMarkAllRead={() => void data.markAllNotificationsRead()}
        onRetry={() => void data.refreshNotifications()}
      />
    </ProductSubpage>
  );
}
