import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { MarketRelativeTime } from '@/features/markets/components/market-time-status';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useProductDensity } from '@/hooks/use-product-density';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function NotificationsRoute() {
  const { session } = useAuth();
  const data = useProductDataContext();
  const runtime = useRuntimeCapabilities(session);
  const theme = useVadTheme();
  const density = useProductDensity();
  const maintenance = runtime.snapshot.context.platformStatus === 'MAINTENANCE';
  const maintenanceLabel = runtime.snapshot.context.platformPauseScope === 'USER'
    ? 'ACCOUNT NOTICE'
    : 'VAD MAINTENANCE';
  const maintenanceMessage = runtime.snapshot.context.platformMessage
    ?? (runtime.snapshot.context.platformPauseScope === 'USER'
      ? 'Some actions are temporarily unavailable for your account. You can still view your existing information.'
      : 'Some actions are temporarily unavailable while we carry out maintenance.');
  const resumesAt = runtime.snapshot.context.platformResumesAt;
  const hasItems = maintenance || data.publicNotices.length > 0;

  return (
    <ProductSubpage title="Notifications" maxWidth={720}>
      <VadCard
        variant="brand"
        style={{
          padding: density.phone ? theme.spacing.lg : theme.spacing.xl,
          gap: theme.spacing.sm,
          overflow: 'hidden',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <VadIcon name="bell" size={21} tone="brand" />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <VadText variant="caption" tone="brand">VAD UPDATES</VadText>
            <VadText variant={density.phone ? 'heading' : 'title'}>Notifications that matter</VadText>
            <VadText variant="caption" tone="secondary">
              Platform updates and important account notices stay here instead of interrupting what you are doing.
            </VadText>
          </View>
        </View>
      </VadCard>

      {hasItems ? (
        <View style={{ gap: theme.spacing.sm }}>
          {maintenance ? (
            <NoticeCard
              eyebrow={maintenanceLabel}
              title={maintenanceMessage}
              tone="warning"
              detail={resumesAt ? `Scheduled to resume ${new Date(resumesAt).toLocaleString()}` : undefined}
            />
          ) : null}

          {data.publicNotices.map((notice) => (
            <NoticeCard
              key={notice.public_id}
              eyebrow={notice.tone === 'WARNING' ? 'SERVICE NOTICE' : 'VAD UPDATE'}
              title={notice.message}
              tone={notice.tone === 'WARNING' ? 'warning' : 'yes'}
              createdAt={'created_at' in notice && typeof notice.created_at === 'string' ? notice.created_at : undefined}
            />
          ))}
        </View>
      ) : (
        <VadEmptyState
          title="You're all caught up"
          body="There are no active VAD service or account notices right now."
        />
      )}
    </ProductSubpage>
  );
}

function NoticeCard({
  eyebrow,
  title,
  tone,
  detail,
  createdAt,
}: {
  eyebrow: string;
  title: string;
  tone: 'warning' | 'yes';
  detail?: string;
  createdAt?: string;
}) {
  const theme = useVadTheme();
  return (
    <VadCard
      variant="raised"
      style={{
        gap: 5,
        borderLeftWidth: 3,
        borderLeftColor: tone === 'warning' ? theme.colors.warning : theme.colors.yes,
      }}
    >
      <VadText variant="caption" tone={tone}>{eyebrow}</VadText>
      <VadText variant="bodyStrong">{title}</VadText>
      {detail ? <VadText variant="caption" tone="secondary">{detail}</VadText> : null}
      {createdAt ? <MarketRelativeTime value={createdAt} prefix="Posted" /> : null}
    </VadCard>
  );
}
