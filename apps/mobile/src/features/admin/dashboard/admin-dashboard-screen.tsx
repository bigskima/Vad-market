import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import type { AdminHref } from '@/features/admin/components/admin-navigation';
import { useAdminResponsive } from '@/features/admin/components/use-admin-responsive';
import { AdminMetricCard } from '@/features/admin/dashboard/admin-metric-card';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { hasAnyAdminPermission } from '@/services/admin-control-api';
import type {
  AdminLaunchReadinessGateStatus,
} from '@/services/service-control-admin-api';

function runtimeNumber(
  runtime: Record<string, number | string> | null,
  key: string,
) {
  const value = runtime?.[key];
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function releaseStateLabel(value: string) {
  if (value === 'LIVE_READY') return 'LIVE READY';
  if (value === 'MARKET_LIFECYCLE_READY') return 'MARKETS READY';
  if (value === 'PLATFORM_READY_MARKET_BLOCKED') return 'PLATFORM READY';
  return 'HARDENING';
}

function releaseStateTone(value: string): 'yes' | 'warning' | 'danger' | 'brand' {
  if (value === 'LIVE_READY' || value === 'MARKET_LIFECYCLE_READY') return 'yes';
  if (value === 'PLATFORM_READY_MARKET_BLOCKED') return 'warning';
  return 'danger';
}

function gateTone(status: AdminLaunchReadinessGateStatus): 'yes' | 'warning' | 'danger' | 'neutral' {
  if (status === 'READY') return 'yes';
  if (status === 'BLOCKED') return 'danger';
  if (status === 'PAUSED') return 'neutral';
  return 'warning';
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
    !data.oracleQueue.length &&
    !data.services.length &&
    !data.launchReadiness
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

  const kyc = data.services.find((service) => service.service_key === 'kyc_start');
  const moneyKeys = new Set(['trading', 'deposits', 'withdrawals', 'settlement']);
  const moneyServices = data.services.filter((service) => moneyKeys.has(service.service_key));
  const moneyPaused = moneyServices.length === 4 && moneyServices.every((service) => !service.enabled);
  const nonMoneyServices = data.services.filter((service) => !moneyKeys.has(service.service_key));
  const enabledNonMoney = nonMoneyServices.filter((service) => service.enabled).length;
  const roleLabel = data.access.isSuperAdmin
    ? 'Super Admin'
    : data.access.roles.map((role) => role.name).join(' · ') || 'Scoped admin';
  const releaseGates = data.launchReadiness?.gates ?? [];
  const releaseExceptions = releaseGates.filter((gate) => gate.status !== 'READY');

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
            Live operational signals are grouped by markets, money, trust and
            infrastructure. Your role determines which areas and actions are
            available to you.
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

      {data.warning ? (
        <VadErrorState title="Some operations data is stale" message={data.warning} onRetry={() => void data.refresh()} />
      ) : null}

      {data.launchReadiness ? (
        <VadCard
          variant="raised"
          style={{
            gap: theme.spacing.lg,
            borderColor:
              data.launchReadiness.blockerCount > 0
                ? theme.colors.danger
                : data.launchReadiness.warningCount > 0
                  ? theme.colors.warning
                  : theme.colors.yes,
          }}
        >
          <View
            style={{
              flexDirection: responsive.tablet ? 'row' : 'column',
              justifyContent: 'space-between',
              alignItems: responsive.tablet ? 'center' : 'flex-start',
              gap: theme.spacing.md,
            }}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <VadText variant="caption" tone="brand">PRODUCTION READINESS</VadText>
              <VadText variant="heading">Release gates are measured from live platform state.</VadText>
              <VadText variant="caption" tone="secondary">
                This does not activate providers or money movement. It shows what is ready, paused or still blocking a production market lifecycle.
              </VadText>
            </View>
            <VadChip
              label={releaseStateLabel(data.launchReadiness.releaseState)}
              tone={releaseStateTone(data.launchReadiness.releaseState)}
            />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <AdminMetricCard
              label="Blockers"
              value={data.launchReadiness.blockerCount}
              tone={data.launchReadiness.blockerCount ? 'no' : 'yes'}
            />
            <AdminMetricCard
              label="Warnings"
              value={data.launchReadiness.warningCount}
              tone={data.launchReadiness.warningCount ? 'warning' : 'yes'}
            />
            <AdminMetricCard
              label="Real-money launch"
              value={data.launchReadiness.realMoneyReady ? 'Ready' : 'Not ready'}
              tone={data.launchReadiness.realMoneyReady ? 'yes' : 'warning'}
            />
          </View>

          {releaseExceptions.length ? (
            <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              {releaseExceptions.slice(0, 6).map((gate) => (
                <View
                  key={gate.key}
                  style={{
                    minHeight: 64,
                    paddingVertical: theme.spacing.sm,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.md,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <VadText variant="bodyStrong">{gate.title}</VadText>
                    <VadText variant="caption" tone="secondary">{gate.detail}</VadText>
                  </View>
                  <VadChip label={gate.status} tone={gateTone(gate.status)} />
                </View>
              ))}
            </View>
          ) : (
            <VadText variant="bodyStrong" tone="yes">All measured release gates are ready.</VadText>
          )}
        </VadCard>
      ) : null}

      <View
        style={{
          flexDirection: responsive.desktop ? 'row' : 'column',
          alignItems: 'stretch',
          gap: theme.spacing.md,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={data.access.isSuperAdmin ? 'Open roles and access' : 'View current operational authority'}
          onPress={data.access.isSuperAdmin ? () => router.push('/admin/roles') : undefined}
          style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.68 : 1 })}
        >
          <VadCard variant="raised" style={{ gap: theme.spacing.md, height: '100%' }}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'space-between', alignItems: 'center' }}>
              <VadText variant="caption" tone="brand">OPERATIONAL AUTHORITY</VadText>
              <VadChip
                label={data.access.isSuperAdmin ? 'FULL ACCESS' : 'SCOPED ACCESS'}
                tone={data.access.isSuperAdmin ? 'yes' : 'brand'}
              />
            </View>
            <View style={{ gap: 3 }}>
              <VadText variant="heading">{roleLabel}</VadText>
              <VadText variant="caption" tone="secondary">
                {data.access.isSuperAdmin
                  ? 'Full VAD administrative access. Service controls and role management remain restricted to Super Admin.'
                  : `${data.access.permissions.length} permission${data.access.permissions.length === 1 ? '' : 's'} assigned. Only matching operational areas and actions are available.`}
              </VadText>
            </View>
            {data.access.isSuperAdmin ? (
              <VadText variant="caption" tone="brand">Manage roles & access →</VadText>
            ) : null}
          </VadCard>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={data.access.isSuperAdmin ? 'Open service controls' : 'View launch service posture'}
          onPress={data.access.isSuperAdmin ? () => router.push('/admin/service-controls') : undefined}
          style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.68 : 1 })}
        >
          <VadCard variant="raised" style={{ gap: theme.spacing.md, height: '100%' }}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'space-between', alignItems: 'center' }}>
              <VadText variant="caption" tone="brand">LAUNCH POSTURE</VadText>
              <VadChip label={moneyPaused ? 'MONEY PAUSED' : 'CHECK MONEY'} tone={moneyPaused ? 'warning' : 'danger'} />
            </View>
            <ServiceStatusRow label="KYC / identity verification" enabled={Boolean(kyc?.enabled)} />
            <ServiceStatusRow
              label="Non-money services"
              enabled={nonMoneyServices.length > 0 && enabledNonMoney === nonMoneyServices.length}
              detail={nonMoneyServices.length ? `${enabledNonMoney}/${nonMoneyServices.length} available` : 'Status unavailable'}
            />
            <ServiceStatusRow
              label="Trading & money movement"
              enabled={!moneyPaused}
              paused={moneyPaused}
              detail={moneyPaused ? 'Intentionally disabled for launch' : 'At least one money service is available'}
            />
            {data.access.isSuperAdmin ? (
              <VadText variant="caption" tone="brand">Open service controls →</VadText>
            ) : null}
          </VadCard>
        </Pressable>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <View style={{ gap: 2 }}>
          <VadText variant="heading">Platform status</VadText>
          <VadText variant="caption" tone="secondary">
            Current market, payment, provider and operations indicators.
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
                detail="Failed payments may require provider or support review."
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
                detail="Payments waiting for provider confirmation."
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
                detail="Provider changes waiting for approval."
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

function ServiceStatusRow({
  label,
  enabled,
  paused = false,
  detail,
}: {
  label: string;
  enabled: boolean;
  paused?: boolean;
  detail?: string;
}) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <VadText variant="bodyStrong">{label}</VadText>
        {detail ? <VadText variant="caption" tone="secondary">{detail}</VadText> : null}
      </View>
      <VadChip
        label={paused ? 'PAUSED' : enabled ? 'ACTIVE' : 'UNAVAILABLE'}
        tone={paused ? 'warning' : enabled ? 'yes' : 'danger'}
      />
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
