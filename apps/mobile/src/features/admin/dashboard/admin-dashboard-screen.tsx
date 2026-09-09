import { router } from 'expo-router';
import { RefreshControl, ScrollView, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { money } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import { AdminMetricCard } from './admin-metric-card';
import { AdminSectionCard } from './admin-section-card';
import { useAdminDashboard } from './use-admin-dashboard';

export function AdminDashboardScreen() {
  const theme = useVadTheme();
  const data = useAdminDashboard();

  if (data.loading) {
    return <View style={{ gap: theme.spacing.md }}>
      <VadSkeleton width="55%" height={34} />
      <VadSkeleton height={150} />
      <VadSkeleton height={190} />
      <VadSkeleton height={190} />
    </View>;
  }

  if (data.error) {
    return <VadErrorState title="Control plane unavailable" message={data.error} onRetry={() => void data.load()} />;
  }

  const configured = data.providers.filter((row) => row.configured).length;
  const attention =
    data.marketQueue.length +
    data.oracleQueue.length +
    Number(data.operations?.kycInReview ?? data.kycQueue.length) +
    Number(data.operations?.paymentProviderPending ?? data.paymentQueue.length) +
    data.providerChanges.length;

  return <ScrollView
    refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.refresh} tintColor={theme.colors.brandPrimary} colors={[theme.colors.brandPrimary]} />}
    contentContainerStyle={{ gap: theme.spacing.xl, paddingBottom: theme.spacing.xxl }}
  >
    <View style={{ gap: theme.spacing.xs }}>
      <VadText variant="label" tone="brand">VAD CONTROL PLANE</VadText>
      <VadText variant="title">Platform operations.</VadText>
      <VadText tone="secondary">Governance, oracle, identity, provider and finance visibility remain permission-gated by backend roles.</VadText>
    </View>

    <VadCard
      style={{
        backgroundColor: theme.colors.brandPrimary,
        borderColor: theme.colors.brandPrimary,
        borderRadius: theme.radius.xl,
        gap: theme.spacing.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <VadText variant="caption" tone="inverse">ACTION CENTER</VadText>
          <VadText variant="display" tone="inverse">{attention}</VadText>
          <VadText variant="caption" tone="inverse">items currently visible across your authorized queues</VadText>
        </View>
        <VadButton label="Open operations" fullWidth={false} variant="secondary" onPress={() => router.push('/admin-operations')} />
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
        <HeroFact label="Configured providers" value={String(configured)} />
        <HeroFact label="Provider approvals" value={String(data.providerChanges.length)} />
        <HeroFact label="Market review" value={String(data.marketQueue.length)} />
      </View>
    </VadCard>

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
      <AdminMetricCard label="Market review" value={data.marketQueue.length} tone={data.marketQueue.length ? 'warning' : 'yes'} detail="Governance" />
      <AdminMetricCard label="Oracle queue" value={data.oracleQueue.length} tone={data.oracleQueue.length ? 'warning' : 'yes'} detail="Resolution" />
      <AdminMetricCard label="KYC review" value={data.operations?.kycInReview ?? data.kycQueue.length} detail="Compliance" />
      <AdminMetricCard label="Payments pending" value={data.operations?.paymentProviderPending ?? data.paymentQueue.length} detail="Finance" />
      <AdminMetricCard label="Provider approvals" value={data.providerChanges.length} detail="Maker / checker" />
      <AdminMetricCard label="Configured providers" value={configured} tone="brand" detail="Runtime" />
    </View>

    <AdminSectionCard
      title="Provider health"
      description="Configuration, runtime status and routing readiness are deliberately separate controls."
      meta={`${configured}/${data.providers.length} configured`}
    >
      {data.providers.length
        ? data.providers.slice(0, 8).map((row, index) => (
          <AdminRow
            key={`${row.provider_code}-${row.operation}-${index}`}
            title={`${row.provider_code} · ${row.environment}`}
            detail={`${row.operation ?? 'No route'} · ${row.country_code ?? '—'} · ${row.asset_code ?? 'all assets'}`}
            status={row.configured ? row.provider_status : 'UNCONFIGURED'}
            ready={row.configured}
          />
        ))
        : <VadText tone="secondary">No provider readiness rows are available.</VadText>}
    </AdminSectionCard>

    <AdminSectionCard
      title="Governance queues"
      description="Review surfaces only. Backend permissions and maker-checker rules stay authoritative."
      meta={`${data.marketQueue.length + data.oracleQueue.length} open`}
    >
      {data.marketQueue.length
        ? data.marketQueue.slice(0, 5).map((row, index) => (
          <AdminRow
            key={`market-${index}`}
            title={String(row.question ?? row.title ?? 'Market proposal')}
            detail={String(row.category ?? row.status ?? 'Awaiting review')}
            status={String(row.status ?? 'PENDING')}
          />
        ))
        : <VadText tone="secondary">No market proposals need review.</VadText>}

      {data.oracleQueue.length
        ? data.oracleQueue.slice(0, 5).map((row, index) => (
          <AdminRow
            key={`oracle-${index}`}
            title={String(row.event_title ?? row.market_title ?? 'Oracle case')}
            detail={String(row.resolution_status ?? row.status ?? 'Awaiting evidence')}
            status={String(row.status ?? row.resolution_status ?? 'OPEN')}
          />
        ))
        : <VadText tone="secondary">No oracle cases need attention.</VadText>}
    </AdminSectionCard>

    <AdminSectionCard title="Money movement" meta={`${data.paymentQueue.length} queued`}>
      {data.paymentQueue.length
        ? data.paymentQueue.slice(0, 6).map((row) => (
          <AdminRow
            key={row.intent_public_id}
            title={`${row.operation} · ${money(row.amount)}`}
            detail={`${row.provider_code ?? 'No provider'} · fee ${money(row.fee_amount)}`}
            status={row.status}
            ready={row.status === 'SETTLED'}
          />
        ))
        : <VadText tone="secondary">No payment intents are in the operations queue.</VadText>}
    </AdminSectionCard>

    {data.runtime ? (
      <AdminSectionCard title="Runtime snapshot" description="Read-only operational values returned by the backend.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          {Object.entries(data.runtime)
            .filter(([key]) => key !== 'generatedAt')
            .slice(0, 8)
            .map(([key, value]) => (
              <AdminMetricCard key={key} label={key.replace(/([A-Z])/g, ' $1')} value={String(value)} />
            ))}
        </View>
      </AdminSectionCard>
    ) : null}
  </ScrollView>;
}

function HeroFact({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return <View style={{ minWidth: 120, flexGrow: 1, borderTopWidth: 1, borderTopColor: theme.colors.brandAccent, paddingTop: theme.spacing.xs, gap: theme.spacing.xxs }}>
    <VadText variant="bodyStrong" tone="inverse">{value}</VadText>
    <VadText variant="caption" tone="inverse">{label}</VadText>
  </View>;
}

function AdminRow({ title, detail, status, ready = false }: { title: string; detail: string; status: string; ready?: boolean }) {
  const theme = useVadTheme();
  return <View
    style={{
      flexDirection: 'row',
      gap: theme.spacing.sm,
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: theme.spacing.sm,
    }}
  >
    <View style={{ flex: 1, gap: theme.spacing.xxs }}>
      <VadText variant="bodyStrong" numberOfLines={2}>{title}</VadText>
      <VadText variant="caption" tone="secondary" numberOfLines={2}>{detail}</VadText>
    </View>
    <View style={{ borderRadius: theme.radius.pill, backgroundColor: ready ? theme.colors.yesSoft : theme.colors.surfaceMuted, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
      <VadText variant="caption" tone={ready ? 'yes' : 'secondary'}>{status}</VadText>
    </View>
  </View>;
}
