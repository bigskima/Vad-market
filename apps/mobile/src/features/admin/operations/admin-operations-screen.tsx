import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { money } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import { getAdminKycQueue, getAdminOperationsSummary, getAdminPaymentQueue, type KycQueueRow, type OperationsSummary, type PaymentQueueRow } from '@/services/operations-admin-api';
import { getAdminProviderReadiness, getProviderChangeQueue, type ProviderChangeRequest, type ProviderReadinessRow } from '@/services/provider-admin-api';
import { OperationsRow, OperationsSection } from './operations-section';

export function AdminOperationsFeature() {
  const theme = useVadTheme();
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [kyc, setKyc] = useState<KycQueueRow[]>([]);
  const [payments, setPayments] = useState<PaymentQueueRow[]>([]);
  const [providers, setProviders] = useState<ProviderReadinessRow[]>([]);
  const [changes, setChanges] = useState<ProviderChangeRequest[]>([]);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([getAdminOperationsSummary(), getAdminKycQueue(30), getAdminPaymentQueue(30), getAdminProviderReadiness(), getProviderChangeQueue()]);
    if (results.every((result) => result.status === 'rejected')) { setDenied(true); return; }
    setDenied(false);
    if (results[0].status === 'fulfilled') setSummary(results[0].value);
    if (results[1].status === 'fulfilled') setKyc(results[1].value);
    if (results[2].status === 'fulfilled') setPayments(results[2].value);
    if (results[3].status === 'fulfilled') setProviders(results[3].value);
    if (results[4].status === 'fulfilled') setChanges(results[4].value);
  }, []);

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  if (denied) return <VadCard><VadText variant="heading">Operations access required</VadText><VadText tone="secondary">Backend permissions control whether compliance, finance or provider data can be read.</VadText></VadCard>;

  return <View style={{ gap: theme.spacing.lg }}>
    <View style={{ gap: theme.spacing.xs }}><VadText variant="label" tone="brand">CONTROL PLANE</VadText><VadText variant="title">Identity & money movement.</VadText><VadButton label="Refresh operations" variant="secondary" onPress={() => void load()} /></View>
    {summary ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>{[
      ['KYC review', summary.kycInReview], ['KYC verified', summary.kycVerified], ['Payments pending', summary.paymentProviderPending], ['Payments failed', summary.paymentFailed], ['Provider approvals', summary.pendingProviderChanges], ['Configured providers', summary.configuredProviders],
    ].map(([label, value]) => <VadCard key={String(label)} variant="raised" style={{ minWidth: 110, flexGrow: 1 }}><VadText variant="heading">{Number(value)}</VadText><VadText variant="caption" tone="secondary">{String(label)}</VadText></VadCard>)}</View> : null}

    <OperationsSection title="Provider readiness">{providers.length ? providers.slice(0, 12).map((row, index) => <OperationsRow key={`${row.provider_code}-${row.operation}-${index}`} title={`${row.provider_code} · ${row.environment}`} detail={`${row.operation ?? 'No route'} · ${row.country_code ?? '—'} · ${row.asset_code ?? 'all assets'}`} status={row.configured ? row.provider_status : 'UNCONFIGURED'} ready={row.configured} />) : <VadText tone="secondary">No provider rows available for your permissions.</VadText>}</OperationsSection>
    <OperationsSection title="Pending provider approvals">{changes.length ? changes.map((row) => <OperationsRow key={row.request_public_id} title={`${row.provider_code}: ${row.current_status} → ${row.requested_status}`} detail={row.reason} status="PENDING" />) : <VadText tone="secondary">No provider status changes are awaiting a checker.</VadText>}</OperationsSection>
    <OperationsSection title="KYC queue">{kyc.length ? kyc.slice(0, 12).map((row) => <OperationsRow key={row.case_public_id} title={`${row.verification_level} · ${row.provider_code ?? 'No provider'}`} detail={`${row.user_id.slice(0, 8)}… · ${row.country_code}`} status={row.status} ready={row.status === 'VERIFIED'} />) : <VadText tone="secondary">No KYC cases in this queue.</VadText>}</OperationsSection>
    <OperationsSection title="Payment intents">{payments.length ? payments.slice(0, 12).map((row) => <OperationsRow key={row.intent_public_id} title={`${row.operation} · ${money(row.amount)}`} detail={`${row.provider_code ?? 'No provider'} · fee ${money(row.fee_amount)}`} status={row.status} ready={row.status === 'SETTLED'} />) : <VadText tone="secondary">No payment intents yet.</VadText>}</OperationsSection>
  </View>;
}
