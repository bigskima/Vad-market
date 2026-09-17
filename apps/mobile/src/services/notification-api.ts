import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type UserNotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';

export type UserNotificationRow = {
  public_id: string;
  notification_type: string;
  title: string;
  body: string;
  severity: UserNotificationSeverity;
  market_public_id: string | null;
  order_public_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export async function getNotifications(limit = 60) {
  const { data, error } = await supabase.rpc('my_notifications', { p_limit: limit });
  if (error) throw userFacingError(error, 'general', 'We could not load your notifications right now.');
  return (data ?? []) as UserNotificationRow[];
}

export async function markNotificationRead(notificationPublicId: string) {
  const { data, error } = await supabase.rpc('mark_notification_read', {
    p_notification_public_id: notificationPublicId,
  });
  if (error) throw userFacingError(error, 'general', 'We could not update this notification right now.');
  return Boolean(data);
}

export async function markAllNotificationsRead() {
  const { data, error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw userFacingError(error, 'general', 'We could not update your notifications right now.');
  return Number(data ?? 0);
}
