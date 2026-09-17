import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { UserNotificationRow } from '@/services/notification-api';

type Filter = 'ALL' | 'MARKETS' | 'TRADES' | 'PAYOUTS';

const filters = [
  { value: 'ALL', label: 'All' },
  { value: 'MARKETS', label: 'Markets' },
  { value: 'TRADES', label: 'Trades' },
  { value: 'PAYOUTS', label: 'Payouts' },
] as const;

function bucket(item: UserNotificationRow): Filter {
  const type = item.notification_type.toUpperCase();
  if (type.includes('PAYOUT') || type.includes('SETTLEMENT')) return 'PAYOUTS';
  if (type.includes('TRADE') || type.includes('ORDER') || type.includes('POSITION')) return 'TRADES';
  return 'MARKETS';
}

function tone(item: UserNotificationRow): 'brand' | 'yes' | 'warning' | 'danger' | 'neutral' {
  if (item.severity === 'SUCCESS') return 'yes';
  if (item.severity === 'WARNING') return 'warning';
  if (item.severity === 'DANGER') return 'danger';
  return item.read_at ? 'neutral' : 'brand';
}

function timeLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function NotificationsScreen({
  notifications,
  error,
  onOpen,
  onMarkRead,
  onMarkAllRead,
  onRetry,
}: {
  notifications: UserNotificationRow[];
  error?: string | null;
  onOpen: (notification: UserNotificationRow) => void;
  onMarkRead: (notification: UserNotificationRow) => void;
  onMarkAllRead: () => void;
  onRetry: () => void;
}) {
  const theme = useVadTheme();
  const [filter, setFilter] = useState<Filter>('ALL');
  const unread = notifications.filter((item) => !item.read_at).length;
  const visible = useMemo(
    () => filter === 'ALL' ? notifications : notifications.filter((item) => bucket(item) === filter),
    [filter, notifications],
  );

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <VadCard variant="brand" style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <View style={{ flex: 1, gap: 3 }}>
            <VadText variant="caption" tone="brand">LIVE VAD ACTIVITY</VadText>
            <VadText variant="heading">Notifications</VadText>
            <VadText variant="caption" tone="secondary">
              Trades, market lifecycle changes, results and payouts appear here as they happen.
            </VadText>
          </View>
          <VadChip label={unread ? `${unread} unread` : 'All caught up'} tone={unread ? 'brand' : 'yes'} />
        </View>
        {unread > 0 ? <VadButton label="Mark all as read" size="small" variant="secondary" onPress={onMarkAllRead} /> : null}
      </VadCard>

      <VadSegmentedControl value={filter} options={filters} onChange={setFilter} />

      {error ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
          <VadText variant="bodyStrong">Notifications could not refresh</VadText>
          <VadText variant="caption" tone="secondary">{error}</VadText>
          <VadButton label="Try again" size="small" variant="secondary" onPress={onRetry} />
        </VadCard>
      ) : null}

      {!visible.length ? (
        <VadCard variant="muted" style={{ minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <VadText variant="bodyStrong">No notifications here yet</VadText>
          <VadText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
            VAD will surface relevant trade, market, result and payout activity here.
          </VadText>
        </VadCard>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {visible.map((item) => {
            const unreadItem = !item.read_at;
            return (
              <Pressable
                key={item.public_id}
                accessibilityRole="button"
                onPress={() => onOpen(item)}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
              >
                <VadCard variant={unreadItem ? 'raised' : 'muted'} style={{ gap: theme.spacing.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
                    <VadChip label={bucket(item)} tone={tone(item)} />
                    {unreadItem ? <VadChip label="NEW" tone="brand" /> : null}
                    <View style={{ flex: 1 }} />
                    <VadText variant="caption" tone="tertiary">{timeLabel(item.created_at)}</VadText>
                  </View>
                  <VadText variant="bodyStrong">{item.title}</VadText>
                  <VadText variant="caption" tone="secondary">{item.body}</VadText>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                    {unreadItem ? (
                      <VadButton
                        label="Mark read"
                        size="small"
                        variant="plain"
                        onPress={() => onMarkRead(item)}
                      />
                    ) : null}
                  </View>
                </VadCard>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
