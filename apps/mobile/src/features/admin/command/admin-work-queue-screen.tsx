import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import type { AdminHref } from '@/features/admin/components/admin-navigation';
import { useAdminResponsive } from '@/features/admin/components/use-admin-responsive';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

type WorkItem = {
  key: string;
  domain: string;
  title: string;
  detail: string;
  status: string;
  href: AdminHref;
  createdAt?: string | null;
};

function text(row: Record<string, unknown>, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return fallback;
}

function isResolved(status: string) {
  const normalized = status.toUpperCase();
  return ['VERIFIED', 'SETTLED', 'APPROVED', 'COMPLETED', 'RESOLVED'].some(
    (value) => normalized.includes(value),
  );
}

function itemTone(status: string): 'warning' | 'danger' | 'brand' {
  const normalized = status.toUpperCase();
  if (
    normalized.includes('FAIL') ||
    normalized.includes('ERROR') ||
    normalized.includes('UNAVAILABLE') ||
    normalized.includes('REJECT')
  ) {
    return 'danger';
  }
  return normalized.includes('PENDING') || normalized.includes('REVIEW')
    ? 'warning'
    : 'brand';
}

export function AdminWorkQueueScreen() {
  const theme = useVadTheme();
  const data = useAdminData();
  const responsive = useAdminResponsive();

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="38%" height={30} />
        <VadSkeleton height={94} />
        <VadSkeleton height={94} />
        <VadSkeleton height={94} />
      </View>
    );
  }

  if (data.error && !data.marketQueue.length && !data.kycQueue.length && !data.paymentQueue.length) {
    return (
      <VadErrorState
        title="Work queue unavailable"
        message={data.error}
        onRetry={() => void data.load()}
      />
    );
  }

  const items: WorkItem[] = [
    ...data.marketQueue.map((row, index) => ({
      key: `market-${text(row, ['public_id', 'instrument_public_id', 'proposal_public_id'], String(index))}`,
      domain: 'Markets',
      title: text(row, ['question', 'title', 'market_title'], 'Market review required'),
      detail: text(row, ['context', 'reason', 'category'], 'Open the market workspace to review this item.'),
      status: text(row, ['status'], 'REVIEW'),
      href: '/admin/governance' as const,
      createdAt: text(row, ['created_at', 'updated_at'], ''),
    })),
    ...data.oracleQueue.map((row, index) => ({
      key: `oracle-${text(row, ['public_id', 'event_public_id', 'resolution_public_id'], String(index))}`,
      domain: 'Oracle',
      title: text(row, ['question', 'title', 'event_title'], 'Oracle decision required'),
      detail: text(row, ['reason', 'description', 'resolution_status'], 'Open governance to inspect evidence and resolution state.'),
      status: text(row, ['status', 'resolution_status'], 'REVIEW'),
      href: '/admin/governance' as const,
      createdAt: text(row, ['created_at', 'updated_at'], ''),
    })),
    ...data.kycQueue
      .filter((row) => !isResolved(row.status))
      .map((row) => ({
        key: `kyc-${row.case_public_id}`,
        domain: 'Trust & Safety',
        title: `${row.verification_level} identity review`,
        detail: `${row.country_code} · ${row.provider_code ?? 'Provider not assigned'} · ${row.case_public_id}`,
        status: row.status,
        href: '/admin/compliance' as const,
        createdAt: row.created_at,
      })),
    ...data.paymentQueue
      .filter((row) => !isResolved(row.status))
      .map((row) => ({
        key: `payment-${row.intent_public_id}`,
        domain: 'Money',
        title: `${row.operation} · ${row.asset_code} ${row.amount}`,
        detail: `${row.provider_code ?? 'Provider not assigned'} · ${row.intent_public_id}`,
        status: row.status,
        href: '/admin/payments' as const,
        createdAt: row.created_at,
      })),
    ...data.providerChanges.map((row) => ({
      key: `provider-${row.request_public_id}`,
      domain: 'Infrastructure',
      title: `${row.provider_code}: ${row.current_status} → ${row.requested_status}`,
      detail: row.reason,
      status: 'PENDING APPROVAL',
      href: '/admin/providers' as const,
      createdAt: row.created_at,
    })),
  ].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">COMMAND</VadText>
        <VadText variant="title">Work Queue</VadText>
        <VadText tone="secondary">
          One operational inbox for the action items visible to your current role.
          Actions still execute inside their domain-specific, backend-authorized workflows.
        </VadText>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}
      >
        <QueueMetric label="All open" value={items.length} />
        <QueueMetric
          label="Markets"
          value={items.filter((item) => item.domain === 'Markets' || item.domain === 'Oracle').length}
        />
        <QueueMetric
          label="Money"
          value={items.filter((item) => item.domain === 'Money').length}
        />
        <QueueMetric
          label="Trust"
          value={items.filter((item) => item.domain === 'Trust & Safety').length}
        />
        <QueueMetric
          label="Infrastructure"
          value={items.filter((item) => item.domain === 'Infrastructure').length}
        />
      </View>

      {items.length ? (
        <View
          style={{
            flexDirection: responsive.desktop ? 'row' : 'column',
            flexWrap: responsive.desktop ? 'wrap' : 'nowrap',
            gap: theme.spacing.md,
          }}
        >
          {items.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.domain}: ${item.title}`}
              onPress={() => router.push(item.href)}
              style={({ pressed }) => ({
                width: responsive.desktop ? '48.8%' : '100%',
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <VadCard
                variant="raised"
                style={{
                  minHeight: 116,
                  gap: theme.spacing.sm,
                  borderRadius: theme.radius.lg,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                  }}
                >
                  <VadText variant="caption" tone="tertiary">
                    {item.domain.toUpperCase()}
                  </VadText>
                  <VadText variant="caption" tone={itemTone(item.status)}>
                    {item.status.replaceAll('_', ' ')}
                  </VadText>
                </View>
                <VadText variant="bodyStrong" numberOfLines={2}>
                  {item.title}
                </VadText>
                <VadText variant="caption" tone="secondary" numberOfLines={2}>
                  {item.detail}
                </VadText>
              </VadCard>
            </Pressable>
          ))}
        </View>
      ) : (
        <VadCard variant="outlined" style={{ gap: theme.spacing.sm }}>
          <VadText variant="heading">No action items</VadText>
          <VadText tone="secondary">
            There are no open queue items across the operational domains available to this role.
          </VadText>
        </VadCard>
      )}
    </View>
  );
}

function QueueMetric({ label, value }: { label: string; value: number }) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        minWidth: 112,
        flexGrow: 1,
        paddingVertical: theme.spacing.sm,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <VadText variant="heading">{value}</VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}
