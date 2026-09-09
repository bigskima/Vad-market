import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { KycCard } from '@/components/kyc-card';
import { PaymentReadinessCard } from '@/components/payment-readiness-card';
import { palette } from '@/constants/palette';
import { useAuth } from '@/providers/auth-provider';

export default function AccountOperationsScreen() {
  const { isLoading, session } = useAuth();
  if (isLoading) return <View style={s.root} />;
  if (!session) return <Redirect href="/" />;

  return <View style={s.root}>
    <View style={s.topbar}>
      <Pressable onPress={() => router.back()}><Text style={s.link}>← Back</Text></Pressable>
      <Text style={s.brand}>Account</Text>
      <Pressable onPress={() => router.push('/admin-operations')}><Text style={s.link}>Operations</Text></Pressable>
    </View>
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.eyebrow}>IDENTITY · FUNDING · WITHDRAWALS</Text>
      <Text style={s.hero}>Your VAD account operations.</Text>
      <Text style={s.muted}>Verification and money movement stay governed by live backend capability, KYC and provider policies.</Text>
      <KycCard />
      <PaymentReadinessCard />
      <View style={s.notice}><Text style={s.noticeTitle}>Payment provider not selected yet</Text><Text style={s.muted}>VAD will not send money to an external provider until a configured Nigeria/NGN route has passed provider governance. Your ledger remains the financial source of truth.</Text></View>
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:palette.ink},topbar:{paddingTop:54,paddingHorizontal:20,paddingBottom:14,borderBottomWidth:1,borderBottomColor:palette.line,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  brand:{color:palette.text,fontWeight:'900',fontSize:18},link:{color:palette.signal,fontWeight:'800'},content:{padding:20,paddingBottom:80,gap:14},eyebrow:{color:palette.signal,fontWeight:'900',fontSize:11,letterSpacing:1.1},hero:{color:palette.text,fontWeight:'900',fontSize:29,lineHeight:34},muted:{color:palette.textMuted,fontSize:13,lineHeight:19},notice:{borderWidth:1,borderColor:palette.line,borderRadius:18,padding:15,gap:6},noticeTitle:{color:palette.text,fontWeight:'900',fontSize:15},
});
