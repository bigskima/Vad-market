import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
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

  if (data.loading) return <View style={{ gap: theme.spacing.md }}><VadSkeleton width="55%" height={34} /><VadSkeleton height={130} /><VadSkeleton height={190} /><VadSkeleton height={190} /></View>;
  if (data.error) return <VadErrorState title="Control plane unavailable" message={data.error} onRetry={() => void data.load()} />;

  const configured = data.providers.filter((row) => row.configured).length;
  return <ScrollView refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.refresh} tintColor={theme.colors.brandPrimary} colors={[theme.colors.brandPrimary]} />} contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}>
    <View style={{ gap: theme.spacing.xs }}>
      <VadText variant="label" tone="brand">VAD CONTROL PLANE</VadText>
      <VadText variant="title">Operations at a glance.</VadText>
      <VadText tone="secondary">Market governance, oracle workload, identity, providers and money movement stay permission-gated by backend roles.</VadText>
      <VadButton label="Open identity & payments operations" variant="secondary" onPress={() => router.push('/admin-operations')} />
    </View>

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
      <AdminMetricCard label="Market review" value={data.marketQueue.length} tone={data.marketQueue.length ? 'warning' : 'primary'} />
      <AdminMetricCard label="Oracle queue" value={data.oracleQueue.length} tone={data.oracleQueue.length ? 'warning' : 'primary'} />
      <AdminMetricCard label="KYC review" value={data.operations?.kycInReview ?? data.kycQueue.length} />
      <AdminMetricCard label="Payments pending" value={data.operations?.paymentProviderPending ?? data.paymentQueue.length} />
      <AdminMetricCard label="Provider approvals" value={data.providerChanges.length} />
      <AdminMetricCard label="Configured providers" value={configured} tone="brand" />
    </View>

    <AdminSectionCard title="Provider health" description="Configured status is separate from route priority and provider availability.">
      {data.providers.length ? data.providers.slice(0, 8).map((row, index) => <AdminRow key={`${row.provider_code}-${row.operation}-${index}`} title={`${row.provider_code} · ${row.environment}`} detail={`${row.operation ?? 'No route'} · ${row.country_code ?? '—'} · ${row.asset_code ?? 'all assets'}`} status={row.configured ? row.provider_status : 'UNCONFIGURED'} />) : <VadText tone="secondary">No provider readiness rows are available.</VadText>}
    </AdminSectionCard>

    <AdminSectionCard title="Governance queues" description="These queues are review surfaces only; backend permissions and maker-checker rules remain authoritative.">
      {data.marketQueue.length ? data.marketQueue.slice(0, 5).map((row, index) => <AdminRow key={`market-${index}`} title={String(row.question ?? row.title ?? 'Market proposal')} detail={String(row.category ?? row.status ?? 'Awaiting review')} status={String(row.status ?? 'PENDING')} />) : <VadText tone="secondary">No market proposals need review.</VadText>}
      {data.oracleQueue.length ? data.oracleQueue.slice(0, 5).map((row, index) => <AdminRow key={`oracle-${index}`} title={String(row.event_title ?? row.market_title ?? 'Oracle case')} detail={String(row.resolution_status ?? row.status ?? 'Awaiting evidence')} status={String(row.status ?? row.resolution_status ?? 'OPEN')} />) : <VadText tone="secondary">No oracle cases need attention.</VadText>}
    </AdminSectionCard>

    <AdminSectionCard title="Money movement snapshot">
      {data.paymentQueue.length ? data.paymentQueue.slice(0, 6).map((row) => <AdminRow key={row.intent_public_id} title={`${row.operation} · ${money(row.amount)}`} detail={`${row.provider_code ?? 'No provider'} · fee ${money(row.fee_amount)}`} status={row.status} />) : <VadText tone="secondary">No payment intents are in the operations queue.</VadText>}
    </AdminSectionCard>

    {data.runtime ? <AdminSectionCard title="Runtime summary"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>{Object.entries(data.runtime).filter(([key]) => key !== 'generatedAt').slice(0, 8).map(([key, value]) => <AdminMetricCard key={key} label={key.replace(/([A-Z])/g, ' $1')} value={String(value)} />)}</View></AdminSectionCard> : null}
  </ScrollView>;
}

function AdminRow({ title, detail, status }: { title: string; detail: string; status: string }) {
  const theme = useVadTheme();
  return <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm }}><View style={{ flex: 1, gap: theme.spacing.xxs }}><VadText variant="bodyStrong" numberOfLines={2}>{title}</VadText><VadText variant="caption" tone="secondary" numberOfLines={2}>{detail}</VadText></View><VadText variant="caption" tone="brand">{status}</VadText></View>;
}
