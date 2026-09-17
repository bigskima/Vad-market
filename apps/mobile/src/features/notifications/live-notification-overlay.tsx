import { router } from 'expo-router';
import { View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { UserNotificationRow } from '@/services/notification-api';

export function LiveNotificationOverlay({
  notification,
  onDismiss,
  onRead,
}: {
  notification: UserNotificationRow | null;
  onDismiss: () => void;
  onRead: (publicId: string) => Promise<void>;
}) {
  const theme = useVadTheme();

  function viewNotification() {
    if (!notification) return;
    void onRead(notification.public_id);
    onDismiss();
    if (notification.market_public_id) {
      router.push({
        pathname: '/market/[marketId]',
        params: { marketId: notification.market_public_id },
      });
    } else {
      router.push('/notifications');
    }
  }

  return (
    <VadBottomSheet
      visible={Boolean(notification)}
      title={notification?.title ?? 'VAD update'}
      onClose={onDismiss}
    >
      {notification ? (
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
            <VadChip label={notification.notification_type.replaceAll('_', ' ')} tone={notification.severity === 'SUCCESS' ? 'yes' : notification.severity === 'WARNING' ? 'warning' : notification.severity === 'DANGER' ? 'danger' : 'brand'} />
            <VadChip label="LIVE" tone="brand" />
          </View>
          <VadText tone="secondary">{notification.body}</VadText>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <VadButton label="Later" variant="secondary" onPress={onDismiss} style={{ flex: 1 }} />
            <VadButton label="View" onPress={viewNotification} style={{ flex: 1.2 }} />
          </View>
        </View>
      ) : null}
    </VadBottomSheet>
  );
}
