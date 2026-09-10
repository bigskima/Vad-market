import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import type { AdminHref } from '@/features/admin/components/admin-navigation';
import { useAdminResponsive } from '@/features/admin/components/use-admin-responsive';
import { AdminMetricCard } from '@/features/admin/dashboard/admin-metric-card';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { hasAnyAdminPermission } from '@/services/admin-control-api';

function runtimeNumber(
  runtime: Record<string, number | string> | null,
  key: string,
) {
  const value = runtime?.[key];
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function AdminDashboardScreen() {
  const theme = useVadTheme();
  const data = useAdminData();
  const responsive = useAdminResponsive();

  const canGovern = hasAnyAdminPermission(data.access, [
    'markets.manage',
    'oracle.review',
  ]);
  const canProviders = hasAnyAdminPermission(data.access, [
    'providers.manage',
    'finance.read',
  ]);
  const canCompliance = hasAnyAdminPermission(data.access, [
    'compliance.manage',
    'support.read',
  ]);
  const canPayments = hasAnyAdminPermission(data.access, [
    'finance.read',
    'payments.refund',
  ]);

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="44%" height={34} />
        <VadSkeleton height={96} />
        <VadSkeleton height={160} />
        <VadSkeleton height={160} />
      </View>
    );
  }

  if (
    data.error &&
    !data.runtime &&
    !data.operations &&
    !data.marketQueue.length &&
    !data.oracleQueue.length
  ) {
    return (
      <VadErrorState
        title="Operations unavailable"
        message={data.error}
        onRetry={() => void data.load()}
      />
    );
  }

  const marketAttention = canGovern ? data.marketQueue.length : 0;
  const oracleAttention = canGovern ? data.oracleQueue.length : 0;
  const kycAttention = canCompliance
    ? Number(data.operations?.kycInReview ?? data.kycQueue.length)
    : 0;
  const paymentPending = canPayments
    ? Number(data.operations?.paymentProviderPending ?? data.paymentQueue.length)
    : 0;
  const paymentFailed = canPayments
    ? Number(data.operations?.paymentFailed ?? 0)
    : 0;
  const providerAttention = canProviders ? data.providerChanges.length : 0;
  const feeProposalAttention = data.access.isSuperAdmin
    ? data.feePolicyQueue.length
    : 0;

  const attention =
    marketAttention +
    oracleAttention +
    kycAttention +
    paymentPending +
    paymentFailed +
    providerAttention +
    feeProposalAttention;

  const openMarkets = runtimeNumber(data.runtime, 'openMarkets');
  const awaitingOracle = runtimeNumber(data.runtime, 'awaitingOracle');
  const activeDisputes = runtimeNumber(data.runtime, 'activeDisputes');
  const openOrders = runtimeNumber(data.runtime, 'openOrders');
  const pendingSettlements = runtimeNumber(data.runtime, 'pendingSettlements');
  const oracleProviders = runtimeNumber(data.runtime, 'oracleProviders');
  const paymentProviders = runtimeNumber(data.runtime, 'paymentProviders');
  const configuredProviders = data.providers.filter((row) => row.configured).length;

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View
        style={{
          flexDirection: responsive.desktop ? 'row' : 'column',
          alignItems: responsive.desktop ? 'flex-end' : 'stretch',
          gap: theme.spacing.xl,
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">COMMAND CENTRE</VadText>
          <VadText variant="title">Run VAD from what needs action.</VadText>
          <VadText tone="secondary">
            Live operational signals are grouped by consequence: markets,
            money, trust and infrastructure. Every action remains protected by
            the same backend permission and audit boundaries.
          </VadText>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open unified work queue"
          onPress={() => router.push('/admin/queue')}
          style={({ pressed }) => ({
            minWidth: responsive.desktop ? 260 : undefined,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <VadCard
            variant="raised"
            style={{
              gap: theme.spacing.xs,
              borderColor:
                attention > 0 ? theme.colors.warning : theme.colors.yes,
            }}
          >
            <VadText
              variant="caption"
              tone={attention > 0 ? 'warning' : 'yes'}
            >
              REQUIRES ATTENTION
            </VadText>
            <VadText variant="display">{attention}</VadText>
            <VadText variant="caption" tone="secondary">
              Open the unified queue →
            </VadText>
          </VadCard>
        </Pressable>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <View style={{ gap: 2 }}>
          <VadText variant="heading">Platform status</VadText>
          <VadText variant="caption" tone="secondary">
            Explicit product signals from the backend runtime and operations summaries.
          </VadText>
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
                label="Open markets"
                value={openMarkets}
                tone="brand"
              />
              <AdminMetricCard
                label="Awaiting oracle"
                value={awaitingOracle}
                tone={awaitingOracle ? 'warning' : 'yes'}
              />
              <AdminMetricCard
                label="Active disputes"
                value={activeDisputes}
                tone={activeDisputes ? 'warning' : 'yes'}
              />
              <AdminMetricCard
                label="Pending settlements"
                value={pendingSettlements}
                tone={pendingSettlements ? 'warning' : 'yes'}
              />
            </>
          ) : null}
          {canPayments ? (
            <AdminMetricCard
              label="Payment providers"
              value={paymentProviders}
              tone={paymentProviders > 0 ? 'yes' : 'warning'}
            />
          ) : null}
          {data.access.isSuperAdmin ? (
            <AdminMetricCard
              label="Fee proposals"
              value={feeProposalAttention}
              tone={feeProposalAttention > 0 ? 'warning' : 'yes'}
            />
          ) : null}
          {canProviders ? (
            <AdminMetricCard
              label="Configured providers"
              value={configuredProviders}
              tone={configuredProviders > 0 ? 'yes' : 'warning'}
            />
          ) : null}
        </View>
      </View>

      <View
        style={{
          flexDirection: responsive.desktop ? 'row' : 'column',
          alignItems: 'stretch',
          gap: theme.spacing.xl,
        }}
      >
        <View style={{ flex: 1.05, gap: theme.spacing.md }}>
          <View style={{ gap: 2 }}>
            <VadText variant="heading">Requires attention</VadText>
            <VadText variant="caption" tone="secondary">
              Prioritized queues visible to this operator.
            </VadText>
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
            {canPayments && paymentFailed > 0 ? (
              <AttentionRow
                label="Failed payments"
                detail="Payment intents failed and may require provider or support review."
                count={paymentFailed}
                tone="danger"
                href="/admin/payments"
              />
            ) : null}
            {data.access.isSuperAdmin ? (
              <AttentionRow
                label="Fee proposals"
                detail="Finance fee changes waiting for Super Admin approval."
                count={feeProposalAttention}
                href="/admin/fees"
              />
            ) : null}
            {canGovern ? (
              <>
                <AttentionRow
                  label="Market reviews"
                  detail="Market proposals awaiting an operations decision."
                  count={marketAttention}
                  href="/admin/governance"
                />
                <AttentionRow
                  label="Oracle decisions"
                  detail="Events awaiting resolution or dispute review."
                  count={oracleAttention}
                  href="/admin/governance"
                />
              </>
            ) : null}
            {canPayments ? (
              <AttentionRow
                label="Payments pending"
                detail="Provider-pending money movement visible to finance operations."
                count={paymentPending}
                href="/admin/payments"
              />
            ) : null}
            {canCompliance ? (
              <AttentionRow
                label="KYC in review"
                detail="Identity cases waiting for compliance review."
                count={kycAttention}
                href="/admin/compliance"
              />
            ) : null}
            {canProviders ? (
              <AttentionRow
                label="Provider approvals"
                detail="Maker-checker provider changes waiting for a checker."
                count={providerAttention}
                href="/admin/providers"
              />
            ) : null}
          </View>
        </View>

        <View style={{ flex: 0.95, gap: theme.spacing.md }}>
          {canGovern ? (
            <SnapshotCard
              eyebrow="MARKETS"
              title="Market operations"
              href="/admin/governance"
              metrics={[
                ['Open markets', openMarkets],
                ['Open orders', openOrders],
                ['Awaiting oracle', awaitingOracle],
                ['Disputes', activeDisputes],
              ]}
            />
          ) : null}

          {canPayments || canCompliance || canProviders ? (
            <SnapshotCard
              eyebrow="PLATFORM"
              title="Money, trust & providers"
              href={canPayments ? '/admin/payments' : canCompliance ? '/admin/compliance' : '/admin/providers'}
              metrics={[
                ['Payments pending', paymentPending],
                ['Payments failed', paymentFailed],
                ['KYC review', kycAttention],
                ['Oracle providers', oracleProviders],
              ]}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function AttentionRow({
  label,
  detail,
  count,
  tone = 'warning',
  href,
}: {
  label: string;
  detail: string;
  count: number;
  tone?: 'warning' | 'danger';
  href: AdminHref;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${label}`}
      onPress={() => router.push(href)}
      style={({ pressed }) => ({
        minHeight: 76,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <VadText variant="bodyStrong">{label}</VadText>
        <VadText variant="caption" tone="secondary" numberOfLines={2}>
          {detail}
        </VadText>
      </View>
      <VadText variant="heading" tone={count > 0 ? tone : 'yes'}>
        {count}
      </VadText>
      <VadText variant="heading" tone="tertiary">›</VadText>
    </Pressable>
  );
}

function SnapshotCard({
  eyebrow,
  title,
  href,
  metrics,
}: {
  eyebrow: string;
  title: string;
  href: AdminHref;
  metrics: [string, number][];
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
      onPress={() => router.push(href)}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            <VadText variant="caption" tone="tertiary">{eyebrow}</VadText>
            <VadText variant="heading">{title}</VadText>
          </View>
          <VadText variant="caption" tone="brand">Open →</VadText>
        </View>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.md,
          }}
        >
          {metrics.map(([label, value]) => (
            <View key={label} style={{ minWidth: 92, flexGrow: 1 }}>
              <VadText variant="heading">{value}</VadText>
              <VadText variant="caption" tone="secondary">{label}</VadText>
            </View>
          ))}
        </View>
      </VadCard>
    </Pressable>
  );
}
