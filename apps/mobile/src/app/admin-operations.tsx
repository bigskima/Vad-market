import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { palette } from '@/constants/palette';
import { getAdminKycQueue, getAdminOperationsSummary, getAdminPaymentQueue, type KycQueueRow, type OperationsSummary, type PaymentQueueRow } from '@/services/operations-admin-api';
import { getAdminProviderReadiness, getProviderChangeQueue, type ProviderChangeRequest, type ProviderReadinessRow } from '@/services/provider-admin-api';
import { useAuth } from '@/providers/auth-provider';

const money = (value: unknown) => `₦${Number(value ?? 0).toLocaleString(undefined,{maximumFractionDigits:2})}`;

export default function AdminOperationsScreen() {
  const { isLoading, session } = useAuth();
  const [summary,setSummary] = useState<OperationsSummary | null>(null);
  const [kyc,setKyc] = useState<KycQueueRow[]>([]);
  const [payments,setPayments] = useState<PaymentQueueRow[]>([]);
  const [providers,setProviders] = useState<ProviderReadinessRow[]>([]);
  const [changes,setChanges] = useState<ProviderChangeRequest[]>([]);
  const [denied,setDenied] = useState(false);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([getAdminOperationsSummary(),getAdminKycQueue(30),getAdminPaymentQueue(30),getAdminProviderReadiness(),getProviderChangeQueue()]);
    if (results.every((r) => r.status==='rejected')) { setDenied(true); return; }
    setDenied(false);
    if (results[0].status==='fulfilled') setSummary(results[0].value);
    if (results[1].status==='fulfilled') setKyc(results[1].value);
    if (results[2].status==='fulfilled') setPayments(results[2].value);
    if (results[3].status==='fulfilled') setProviders(results[3].value);
    if (results[4].status==='fulfilled') setChanges(results[4].value);
  },[]);

  useEffect(() => { const timer=setTimeout(() => { void load(); },0); return () => clearTimeout(timer); },[load]);
  if (isLoading) return <View style={s.root} />;
  if (!session) return <Redirect href="/" />;

  return <View style={s.root}>
    <View style={s.topbar}><Pressable onPress={() => router.back()}><Text style={s.link}>← Account</Text></Pressable><Text style={s.brand}>Operations</Text><Pressable onPress={() => void load()}><Text style={s.link}>Refresh</Text></Pressable></View>
    <ScrollView contentContainerStyle={s.content}>
      {denied ? <View style={s.card}><Text style={s.title}>Operations access required</Text><Text style={s.muted}>This route is visible to signed-in users, but backend permissions control whether compliance, finance or provider data can be read.</Text></View> : <>
        <Text style={s.eyebrow}>CONTROL PLANE</Text><Text style={s.hero}>Identity & money movement.</Text>
        {summary && <View style={s.metrics}>{[
          ['KYC review',summary.kycInReview],['KYC verified',summary.kycVerified],['Payments pending',summary.paymentProviderPending],['Payments failed',summary.paymentFailed],['Provider approvals',summary.pendingProviderChanges],['Configured providers',summary.configuredProviders]
        ].map(([label,value]) => <View style={s.metric} key={String(label)}><Text style={s.metricValue}>{Number(value)}</Text><Text style={s.muted}>{label}</Text></View>)}</View>}

        <Section title="Provider readiness">
          {!providers.length ? <Text style={s.muted}>No provider rows available for your permissions.</Text> : providers.slice(0,12).map((row,i) => <View style={s.rowCard} key={`${row.provider_code}-${row.operation}-${i}`}><View style={s.flex}><Text style={s.rowTitle}>{row.provider_code} · {row.environment}</Text><Text style={s.muted}>{row.operation ?? 'No route'} · {row.country_code ?? '—'} · {row.asset_code ?? 'all assets'}</Text></View><Text style={[s.status,row.configured&&s.ready]}>{row.configured ? row.provider_status : 'UNCONFIGURED'}</Text></View>)}
        </Section>

        <Section title="Pending provider approvals">
          {!changes.length ? <Text style={s.muted}>No provider status changes are awaiting a checker.</Text> : changes.map((row) => <View style={s.rowCard} key={row.request_public_id}><View style={s.flex}><Text style={s.rowTitle}>{row.provider_code}: {row.current_status} → {row.requested_status}</Text><Text style={s.muted}>{row.reason}</Text></View><Text style={s.status}>PENDING</Text></View>)}
        </Section>

        <Section title="KYC queue">
          {!kyc.length ? <Text style={s.muted}>No KYC cases in this queue.</Text> : kyc.slice(0,12).map((row) => <View style={s.rowCard} key={row.case_public_id}><View style={s.flex}><Text style={s.rowTitle}>{row.verification_level} · {row.provider_code ?? 'No provider'}</Text><Text style={s.muted}>{row.user_id.slice(0,8)}… · {row.country_code}</Text></View><Text style={s.status}>{row.status}</Text></View>)}
        </Section>

        <Section title="Payment intents">
          {!payments.length ? <Text style={s.muted}>No payment intents yet.</Text> : payments.slice(0,12).map((row) => <View style={s.rowCard} key={row.intent_public_id}><View style={s.flex}><Text style={s.rowTitle}>{row.operation} · {money(row.amount)}</Text><Text style={s.muted}>{row.provider_code ?? 'No provider'} · fee {money(row.fee_amount)}</Text></View><Text style={s.status}>{row.status}</Text></View>)}
        </Section>
      </>}
    </ScrollView>
  </View>;
}

function Section({title,children}:{title:string;children:ReactNode}) { return <View style={s.card}><Text style={s.title}>{title}</Text>{children}</View>; }

const s=StyleSheet.create({root:{flex:1,backgroundColor:palette.ink},topbar:{paddingTop:54,paddingHorizontal:20,paddingBottom:14,borderBottomWidth:1,borderBottomColor:palette.line,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},brand:{color:palette.text,fontWeight:'900',fontSize:18},link:{color:palette.signal,fontWeight:'800'},content:{padding:20,paddingBottom:80,gap:14},eyebrow:{color:palette.signal,fontWeight:'900',fontSize:11,letterSpacing:1.1},hero:{color:palette.text,fontWeight:'900',fontSize:29},muted:{color:palette.textMuted,fontSize:12,lineHeight:18},metrics:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{minWidth:105,flexGrow:1,borderWidth:1,borderColor:palette.line,borderRadius:16,padding:12,gap:3},metricValue:{color:palette.text,fontSize:22,fontWeight:'900'},card:{backgroundColor:palette.panel,borderWidth:1,borderColor:palette.line,borderRadius:20,padding:14,gap:10},title:{color:palette.text,fontSize:17,fontWeight:'900'},rowCard:{flexDirection:'row',gap:10,alignItems:'center',backgroundColor:palette.inkRaised,borderRadius:13,padding:11},flex:{flex:1,gap:2},rowTitle:{color:palette.text,fontWeight:'800'},status:{color:palette.textMuted,fontSize:10,fontWeight:'900'},ready:{color:palette.signal}});
