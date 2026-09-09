import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { getMyKycStatus, startDiditKyc, type KycStatus } from '@/services/identity-api';

export function KycCard() {
  const theme = useVadTheme();
  const [status, setStatus] = useState<KycStatus>({ status: 'NOT_STARTED', providerCode: 'DIDIT', providerConfigured: false });
  const [working, setWorking] = useState(false);
  const load = useCallback(async () => { try { setStatus(await getMyKycStatus()); } catch { /* safe default */ } }, []);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  async function start() {
    setWorking(true);
    try {
      const session = await startDiditKyc();
      if (!(await Linking.canOpenURL(session.verificationUrl))) throw new Error('The verification link could not be opened on this device.');
      await Linking.openURL(session.verificationUrl);
      await load();
    } catch (error) { Alert.alert('Verification unavailable', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWorking(false); }
  }

  const verified = status.status === 'VERIFIED';
  const inProgress = ['CREATED', 'PROVIDER_PENDING', 'IN_REVIEW'].includes(status.status);
  return <VadCard style={{ gap: theme.spacing.sm }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
      <View style={{ flex: 1, gap: theme.spacing.xxs }}><VadText variant="label" tone="brand">IDENTITY</VadText><VadText variant="heading">{verified ? 'Identity verified' : inProgress ? 'Verification in progress' : 'Verify your identity'}</VadText><VadText variant="caption" tone="secondary">Didit · {status.verificationLevel ?? 'STANDARD'} KYC · {status.status.replaceAll('_', ' ')}</VadText></View>
      <VadCard variant="outlined" style={{ borderColor: verified ? theme.colors.yes : theme.colors.border, padding: theme.spacing.xs, borderRadius: theme.radius.pill }}><VadText variant="caption" tone={verified ? 'yes' : 'secondary'}>{verified ? 'VERIFIED' : status.status}</VadText></VadCard>
    </View>
    {!verified ? <VadText tone="secondary">Verification is provider-hosted. VAD stores the verification state and provider reference, not your raw identity-document payload.</VadText> : null}
    {!verified ? <VadButton label={inProgress ? 'Continue verification' : 'Start verification'} loading={working} onPress={() => void start()} /> : null}
  </VadCard>;
}
