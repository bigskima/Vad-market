import { router } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AdminMetricCard } from '@/features/admin/dashboard/admin-metric-card';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { hasAnyAdminPermission } from '@/services/admin-control-api';

export function AdminDashboardScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const data = useAdminData();
  const canGovern = hasAnyAdminPermission(data.access, ['markets.manage', 'oracle.review']);
  const canProviders = hasAnyAdminPermission(data.access, ['providers.manage', 'finance.read']);
  const canCompliance = hasAnyAdminPermission(data.access, ['compliance.manage', 'support.read']);
  const canPayments = hasAnyAdminPermission(data.access, ['finance.read', 'payments.refund']);
  const canUsers = hasAnyAdminPermission(data.access, ['users.manage', 'support.read', 'admin.roles.manage']);
  const canContent = hasAnyAdminPermission(data.access, ['content.moderate']);

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
  const kycAttention = canCompliance
    ? Number(data.operations?.kycInReview ?? data.kycQueue.length)
    : 0;
  const paymentAttention = canPayments
    ? Number(data.operations?.paymentProviderPending ?? data.paymentQueue.length)
    : 0;
  const governanceAttention = canGovern
    ? data.marketQueue.length + data.oracleQueue.length
    : 0;
  const providerAttention = canProviders ? data.providerChanges.length : 0;

  const attention =
    governanceAttention + kycAttention + paymentAttention + providerAttention;

  const roleLabel = data.access.isSuperAdmin
    ? 'Super Admin'
    : data.access.roles.map((role) => role.name).join(' · ') || 'Operations role';

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
            This workspace is assembled from your live roles. Super Admin sees
            the full control plane; other operators see only the areas granted
            by backend permissions.
          </VadText>
          <VadText variant="caption" tone="tertiary">SIGNED IN AS · {roleLabel}</VadText>
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
            VISIBLE ATTENTION ITEMS
          </VadText>
          <VadText variant="display">{attention}</VadText>
          <VadText variant="caption" tone="secondary">
            Counted only across control areas available to this operator.
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
        {canGovern ? (
          <>
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
          </>
        ) : null}
        {canCompliance ? (
          <AdminMetricCard
            label="KYC review"
            value={kycAttention}
            tone={kycAttention ? 'warning' : 'yes'}
          />
        ) : null}
        {canPayments ? (
          <AdminMetricCard
            label="Payments pending"
            value={paymentAttention}
            tone={paymentAttention ? 'warning' : 'yes'}
          />
        ) : null}
        {canProviders ? (
          <>
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
          </>
        ) : null}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <VadText variant="heading">Control areas</VadText>
        <VadText variant="caption" tone="secondary">
          The available areas below come from your active backend roles, not a
          client-side administrator flag.
        </VadText>
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          {canGovern ? (
            <WorkspaceRow
              title="Governance"
              detail="Market review and oracle resolution controls"
              count={governanceAttention}
              onPress={() => router.push('/admin/governance')}
            />
          ) : null}
          {canProviders ? (
            <WorkspaceRow
              title="Providers"
              detail="Runtime readiness, safety actions and maker-checker approvals"
              count={providerAttention}
              onPress={() => router.push('/admin/providers')}
            />
          ) : null}
          {canCompliance ? (
            <WorkspaceRow
              title="Compliance"
              detail="Identity-verification operational review"
              count={kycAttention}
              onPress={() => router.push('/admin/compliance')}
            />
          ) : null}
          {canPayments ? (
            <WorkspaceRow
              title="Payments"
              detail="Deposit/withdrawal state and permission-gated refund workflow"
              count={paymentAttention}
              onPress={() => router.push('/admin/payments')}
            />
          ) : null}
          {canUsers ? (
            <WorkspaceRow
              title="Users"
              detail="Account review, restrictions, suspension and bans"
              onPress={() => router.push('/admin/users')}
            />
          ) : null}
          {canContent ? (
            <WorkspaceRow
              title="Content"
              detail="Audited removal and restoration of posts and comments"
              onPress={() => router.push('/admin/content')}
            />
          ) : null}
        </View>
      </View>

      {data.runtime ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadText variant="heading">Runtime snapshot</VadText>
          <VadText variant="caption" tone="secondary">
            Live operational signals returned by the backend for this role.
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
  count?: number;
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
        {count != null ? (
          <VadText
            variant="heading"
            tone={count ? 'warning' : 'yes'}
          >
            {count}
          </VadText>
        ) : null}
        <VadText variant="caption" tone="brand">Open</VadText>
      </View>
    </Pressable>
  );
}
