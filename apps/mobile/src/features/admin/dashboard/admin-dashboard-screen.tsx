import { router } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AdminMetricCard } from '@/features/admin/dashboard/admin-metric-card';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminDashboardScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const data = useAdminData();

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="52%" height={34} />
        <VadSkeleton height={130} />
        <VadSkeleton height={76} />
        <VadSkeleton height={76} />
      </View>
    );
  }

  if (data.error) {
    return (
      <VadErrorState
        title="Operations unavailable"
        message={data.error}
        onRetry={() => void data.load()}
      />
    );
  }

  const configured = data.providers.filter((row) => row.configured).length;
  const kycAttention = Number(
    data.operations?.kycInReview ?? data.kycQueue.length,
  );
  const paymentAttention = Number(
    data.operations?.paymentProviderPending ?? data.paymentQueue.length,
  );

  const attention =
    data.marketQueue.length +
    data.oracleQueue.length +
    kycAttention +
    paymentAttention +
    data.providerChanges.length;

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1.1,
            justifyContent: 'center',
            gap: theme.spacing.xs,
          }}
        >
          <VadText variant="label" tone="brand">OPERATIONS OVERVIEW</VadText>
          <VadText variant="title">What needs attention now?</VadText>
          <VadText tone="secondary">
            Use this page to triage work. Each control area stays separate and
            backend roles, permissions and maker-checker rules remain authoritative.
          </VadText>
        </View>

        <View
          style={{
            flex: 0.9,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor:
              attention > 0
                ? theme.colors.warning
                : theme.colors.yes,
            paddingVertical: theme.spacing.lg,
            gap: theme.spacing.sm,
          }}
        >
          <VadText
            variant="caption"
            tone={attention > 0 ? 'warning' : 'yes'}
          >
            ATTENTION ITEMS
          </VadText>
          <VadText variant="display">{attention}</VadText>
          <VadText variant="caption" tone="secondary">
            Across governance, providers, compliance and payments.
          </VadText>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}
      >
        <AdminMetricCard
          label="Market review"
          value={data.marketQueue.length}
          tone={data.marketQueue.length ? 'warning' : 'yes'}
        />
        <AdminMetricCard
          label="Oracle queue"
          value={data.oracleQueue.length}
          tone={data.oracleQueue.length ? 'warning' : 'yes'}
        />
        <AdminMetricCard
          label="KYC review"
          value={kycAttention}
          tone={kycAttention ? 'warning' : 'yes'}
        />
        <AdminMetricCard
          label="Payments pending"
          value={paymentAttention}
          tone={paymentAttention ? 'warning' : 'yes'}
        />
        <AdminMetricCard
          label="Provider approvals"
          value={data.providerChanges.length}
          tone={data.providerChanges.length ? 'warning' : 'yes'}
        />
        <AdminMetricCard
          label="Providers configured"
          value={configured}
          tone="brand"
        />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <VadText variant="heading">Control areas</VadText>
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          <WorkspaceRow
            title="Governance"
            detail="Market proposals and oracle resolution queues"
            count={data.marketQueue.length + data.oracleQueue.length}
            onPress={() => router.push('/admin/governance')}
          />
          <WorkspaceRow
            title="Providers"
            detail="Runtime readiness and maker-checker changes"
            count={data.providerChanges.length}
            onPress={() => router.push('/admin/providers')}
          />
          <WorkspaceRow
            title="Compliance"
            detail="Identity verification review"
            count={kycAttention}
            onPress={() => router.push('/admin/compliance')}
          />
          <WorkspaceRow
            title="Payments"
            detail="Deposit and withdrawal operational states"
            count={paymentAttention}
            onPress={() => router.push('/admin/payments')}
          />
        </View>
      </View>

      {data.runtime ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadText variant="heading">Runtime snapshot</VadText>
          <VadText variant="caption" tone="secondary">
            Live operational signals returned by the backend.
          </VadText>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing.sm,
            }}
          >
            {Object.entries(data.runtime)
              .filter(([key]) => key !== 'generatedAt')
              .slice(0, 6)
              .map(([key, value]) => (
                <AdminMetricCard
                  key={key}
                  label={key.replace(/([A-Z])/g, ' $1')}
                  value={String(value)}
                />
              ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function WorkspaceRow({
  title,
  detail,
  count,
  onPress,
}: {
  title: string;
  detail: string;
  count: number;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 76,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">{title}</VadText>
        <VadText variant="caption" tone="secondary">{detail}</VadText>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <VadText
          variant="heading"
          tone={count ? 'warning' : 'yes'}
        >
          {count}
        </VadText>
        <VadText variant="caption" tone="brand">Open</VadText>
      </View>
    </Pressable>
  );
}
