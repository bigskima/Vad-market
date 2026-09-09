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

  const load = useCallback(async () => {
    try { setStatus(await getMyKycStatus()); } catch { /* safe default */ }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function start() {
    if (!status.providerConfigured) return;
    setWorking(true);
    try {
      const session = await startDiditKyc();
      if (!(await Linking.canOpenURL(session.verificationUrl))) {
        throw new Error('The verification link could not be opened on this device.');
      }
      await Linking.openURL(session.verificationUrl);
      await load();
    } catch (error) {
      Alert.alert('Verification unavailable', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  const verified = status.status === 'VERIFIED';
  const inProgress = ['CREATED', 'PROVIDER_PENDING', 'IN_REVIEW'].includes(status.status);
  const statusTone = verified ? 'yes' : inProgress ? 'warning' : status.providerConfigured ? 'brand' : 'secondary';
  const statusLabel = verified
    ? 'VERIFIED'
    : !status.providerConfigured
      ? 'SETUP PENDING'
      : status.status.replaceAll('_', ' ');

  return <VadCard variant="raised" style={{ gap: theme.spacing.md, borderRadius: theme.radius.xl }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <VadText variant="label" tone="brand">IDENTITY</VadText>
        <VadText variant="heading">
          {verified ? 'Identity verified' : inProgress ? 'Verification in progress' : 'Verify your identity'}
        </VadText>
        <VadText variant="caption" tone="secondary">
          {status.providerCode} · {status.verificationLevel ?? 'STANDARD'} · {status.status.replaceAll('_', ' ')}
        </VadText>
      </View>

      <View
        style={{
          borderRadius: theme.radius.pill,
          backgroundColor: verified ? theme.colors.yesSoft : inProgress ? theme.colors.warningSoft : theme.colors.surfaceMuted,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
        }}
      >
        <VadText variant="caption" tone={statusTone}>{statusLabel}</VadText>
      </View>
    </View>

    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
      <Step number="1" label="Start" active={!verified && !inProgress} />
      <Step number="2" label="Review" active={inProgress} />
      <Step number="3" label="Verified" active={verified} />
    </View>

    {!verified ? (
      <VadText variant="caption" tone="secondary">
        Verification is provider-hosted. VAD keeps the provider reference and verification state, not your raw identity-document payload.
      </VadText>
    ) : (
      <VadText variant="caption" tone="secondary">
        Your verified state can be used by live policy to unlock capabilities that require identity assurance.
      </VadText>
    )}

    {!status.providerConfigured && !verified ? (
      <VadCard variant="muted" style={{ padding: theme.spacing.sm }}>
        <VadText variant="caption" tone="warning">
          Didit is selected but its production credentials are not currently available to the runtime, so verification cannot start yet.
        </VadText>
      </VadCard>
    ) : null}

    {!verified ? (
      <VadButton
        label={inProgress ? 'Continue verification' : 'Start verification'}
        loading={working}
        disabled={!status.providerConfigured}
        onPress={() => void start()}
      />
    ) : null}
  </VadCard>;
}

function Step({ number, label, active }: { number: string; label: string; active: boolean }) {
  const theme = useVadTheme();
  return <View style={{ flex: 1, gap: theme.spacing.xxs, alignItems: 'center' }}>
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? theme.colors.brandSoft : theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: active ? theme.colors.brandPrimary : theme.colors.border,
      }}
    >
      <VadText variant="caption" tone={active ? 'brand' : 'secondary'}>{number}</VadText>
    </View>
    <VadText variant="caption" tone={active ? 'brand' : 'secondary'}>{label}</VadText>
  </View>;
}
