import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '@/constants/palette';
import { getMyKycStatus, startDiditKyc, type KycStatus } from '@/services/identity-api';

export function KycCard() {
  const [status, setStatus] = useState<KycStatus>({ status: 'NOT_STARTED', providerCode: 'DIDIT', providerConfigured: false });
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try { setStatus(await getMyKycStatus()); } catch { /* keep safe default */ }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function start() {
    setWorking(true);
    try {
      const session = await startDiditKyc();
      const supported = await Linking.canOpenURL(session.verificationUrl);
      if (!supported) throw new Error('The verification link could not be opened on this device.');
      await Linking.openURL(session.verificationUrl);
      await load();
    } catch (error) {
      Alert.alert('Verification unavailable', error instanceof Error ? error.message : 'Please try again.');
    } finally { setWorking(false); }
  }

  const verified = status.status === 'VERIFIED';
  const inProgress = ['CREATED', 'PROVIDER_PENDING', 'IN_REVIEW'].includes(status.status);

  return <View style={s.card}>
    <View style={s.row}>
      <View style={s.copy}>
        <Text style={s.eyebrow}>IDENTITY</Text>
        <Text style={s.title}>{verified ? 'Identity verified' : inProgress ? 'Verification in progress' : 'Verify your identity'}</Text>
        <Text style={s.muted}>Didit · {status.verificationLevel ?? 'STANDARD'} KYC · {status.status.replaceAll('_', ' ')}</Text>
      </View>
      <View style={[s.badge, verified && s.badgeVerified]}><Text style={s.badgeText}>{verified ? 'VERIFIED' : status.status}</Text></View>
    </View>
    {!verified && <Text style={s.body}>Verification is provider-hosted. VAD stores the verification state and provider reference, not your raw identity-document payload.</Text>}
    {!verified && <Pressable style={[s.button, working && s.disabled]} disabled={working} onPress={() => void start()}><Text style={s.buttonText}>{working ? 'Starting…' : inProgress ? 'Continue verification' : 'Start verification'}</Text></Pressable>}
  </View>;
}

const s = StyleSheet.create({
  card:{backgroundColor:palette.panel,borderColor:palette.line,borderWidth:1,borderRadius:20,padding:15,gap:12},
  row:{flexDirection:'row',alignItems:'flex-start',gap:10},copy:{flex:1,gap:3},eyebrow:{color:palette.signal,fontSize:11,fontWeight:'900',letterSpacing:1.1},
  title:{color:palette.text,fontSize:18,fontWeight:'900'},muted:{color:palette.textMuted,fontSize:12},body:{color:palette.textMuted,fontSize:13,lineHeight:19},
  badge:{borderColor:palette.line,borderWidth:1,borderRadius:999,paddingHorizontal:9,paddingVertical:6},badgeVerified:{borderColor:palette.signal},badgeText:{color:palette.text,fontSize:10,fontWeight:'900'},
  button:{backgroundColor:palette.signal,borderRadius:14,paddingVertical:12,alignItems:'center'},buttonText:{color:palette.ink,fontWeight:'900'},disabled:{opacity:.5},
});
