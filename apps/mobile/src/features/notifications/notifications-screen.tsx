import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useProgressiveList } from '@/hooks/use-progressive-list';
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
  if (type.includes('TRADE') || type.includes('ORDER') || type.includes('POSITION') || type.includes('STAKE')) return 'TRADES';
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
  const density = useProductDensity();
  const [filter, setFilter] = useState<Filter>('ALL');
  const unread = notifications.filter((item) => !item.read_at).length;
  const filtered = useMemo(
    () => filter === 'ALL' ? notifications : notifications.filter((item) => bucket(item) === filter),
    [filter, notifications],
  );
  const progressive = useProgressiveList({
    items: filtered,
    initialCount: density.phone ? 8 : 12,
    step: density.phone ? 8 : 12,
    resetKey: `${filter}|${filtered.length}|${density.phone}`,
  });

  return (
    <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <VadCard
        variant="brand"
        style={{
          padding: density.phone ? theme.spacing.lg : theme.spacing.xl,
          gap: theme.spacing.md,
          overflow: 'hidden',
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 180,
            height: 180,
            borderRadius: 90,
            right: -72,
            top: -88,
            backgroundColor: theme.colors.surface,
            opacity: theme.mode === 'dark' ? 0.06 : 0.4,
          }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
            <VadIcon name="bell" size={21} tone="brand" />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <VadText variant="caption" tone="brand">VAD UPDATES</VadText>
            <VadText variant={density.phone ? 'heading' : 'title'}>Notifications that matter</VadText>
            <VadText variant="caption" tone="secondary">
              Market changes, predictions, orders, results and payouts stay here without interrupting what you are doing.
            </VadText>
          </View>
        </View>

        <View style={{ flexDirection: density.narrow ? 'column' : 'row', alignItems: density.narrow ? 'stretch' : 'center', gap: theme.spacing.sm }}>
          <VadChip label={unread ? `${unread} unread` : 'All caught up'} tone={unread ? 'brand' : 'yes'} />
          <View style={{ flex: 1 }} />
          {unread > 0 ? <VadButton label="Mark all as read" size="small" variant="secondary" fullWidth={density.narrow} onPress={onMarkAllRead} /> : null}
        </View>
      </VadCard>

      <View style={{ gap: theme.spacing.xs }}>
        <VadSegmentedControl value={filter} options={filters} onChange={setFilter} />
        <VadText variant="caption" tone="tertiary">
          Showing {progressive.visibleCount} of {progressive.totalCount} {filter === 'ALL' ? 'notifications' : filter.toLowerCase()}.
        </VadText>
      </View>

      {error ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
          <VadText variant="bodyStrong">Notifications could not refresh</VadText>
          <VadText variant="caption" tone="secondary">{error}</VadText>
          <VadButton label="Try again" size="small" variant="secondary" fullWidth={false} onPress={onRetry} />
        </VadCard>
      ) : null}

      {!progressive.visibleItems.length ? (
        <VadCard variant="muted" style={{ minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <VadIcon name="bell" size={24} tone="tertiary" />
          <VadText variant="bodyStrong">No notifications here yet</VadText>
          <VadText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
            VAD will surface relevant market, prediction, trade, result and payout activity here.
          </VadText>
        </VadCard>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {progressive.visibleItems.map((item) => {
            const unreadItem = !item.read_at;
            return (
              <Pressable
                key={item.public_id}
                accessibilityRole="button"
                onPress={() => onOpen(item)}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.994 : 1 }] })}
              >
                <VadCard
                  variant={unreadItem ? 'raised' : 'muted'}
                  style={{
                    gap: theme.spacing.xs,
                    borderLeftWidth: unreadItem ? 3 : 1,
                    borderLeftColor: unreadItem ? theme.colors.brandPrimary : theme.colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
                    <VadChip label={bucket(item)} tone={tone(item)} />
                    {unreadItem ? <VadChip label="NEW" tone="brand" /> : null}
                    <View style={{ flex: 1 }} />
                    <VadText variant="caption" tone="tertiary">{timeLabel(item.created_at)}</VadText>
                  </View>
                  <VadText variant="bodyStrong">{item.title}</VadText>
                  <VadText variant="caption" tone="secondary">{item.body}</VadText>
                  {unreadItem ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                      <VadButton label="Mark read" size="small" variant="plain" fullWidth={false} onPress={() => onMarkRead(item)} />
                    </View>
                  ) : null}
                </VadCard>
              </Pressable>
            );
          })}

          {progressive.hasMore ? (
            <VadCard variant="raised" style={{ alignItems: 'center', gap: theme.spacing.sm }}>
              <VadText variant="caption" tone="secondary">{progressive.remainingCount} more notifications available.</VadText>
              <VadButton label={`Show next ${progressive.nextCount}`} size="small" variant="secondary" fullWidth={false} onPress={progressive.showMore} />
            </VadCard>
          ) : null}
        </View>
      )}
    </View>
  );
}
