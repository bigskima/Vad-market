import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getMyKycStatus,
  startDiditKyc,
  type KycStatus,
} from '@/services/identity-api';

export function KycCard() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 820;
  const appState = useRef(AppState.currentState);
  const [status, setStatus] = useState<KycStatus>({ status: 'NOT_STARTED', providerCode: 'DIDIT', providerConfigured: false });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);
    try {
      const next = await getMyKycStatus();
      setStatus(next);
      setLastCheckedAt(new Date());
      setActionError(null);
      if (next.status === 'VERIFIED') setActionMessage(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Verification status could not be loaded.');
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasAway = /inactive|background/.test(appState.current);
      appState.current = nextState;
      if (wasAway && nextState === 'active') void load(true);
    });
    return () => subscription.remove();
  }, [load]);

  async function start() {
    if (!status.providerConfigured || working) return;
    setWorking(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const session = await startDiditKyc();
      if (!(await Linking.canOpenURL(session.verificationUrl))) throw new Error('The verification link could not be opened on this device.');
      await Linking.openURL(session.verificationUrl);
      setActionMessage('Verification opened. VAD will refresh your status when you return.');
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.sm }}>
        <VadSkeleton height={density.compact ? 112 : 132} radius={density.cardRadius} />
        <VadSkeleton height={84} radius={density.cardRadius} />
        <VadSkeleton height={84} radius={density.cardRadius} />
      </View>
    );
  }

  if (error && !lastCheckedAt) {
    return <VadErrorState title="Verification status unavailable" message={error} onRetry={() => { setLoading(true); void load(); }} />;
  }

  const verified = status.status === 'VERIFIED';
  const inProgress = ['CREATED', 'PROVIDER_PENDING', 'IN_REVIEW'].includes(status.status);
  const retryNeeded = ['REJECTED', 'EXPIRED', 'CANCELLED'].includes(status.status);
  const statusTone = verified ? 'yes' : retryNeeded ? 'warning' : inProgress ? 'warning' : status.providerConfigured ? 'brand' : 'secondary';
  const statusLabel = verified ? 'VERIFIED' : !status.providerConfigured ? 'SETUP PENDING' : status.status.replaceAll('_', ' ');
  const startLabel = inProgress
    ? 'Continue verification'
    : retryNeeded
      ? 'Restart verification'
      : 'Start verification';

  return (
    <View style={{ gap: density.sectionGap }}>
      {error ? <VadErrorState title="Verification refresh failed" message={error} onRetry={() => void load(true)} /> : null}

      <View style={{ flexDirection: density.width >= 620 ? 'row' : 'column', alignItems: density.width >= 620 ? 'center' : 'stretch', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="caption" tone="brand">IDENTITY VERIFICATION</VadText>
          <VadText variant="heading">
            {verified ? 'Identity verified' : inProgress ? 'Verification in progress' : retryNeeded ? 'Verification needs attention' : 'Verify when required'}
          </VadText>
          <VadText variant="caption" tone="secondary">Provider-hosted identity checks. VAD stores the resulting status, not raw identity documents here.</VadText>
        </View>
        <VadButton label="Refresh" variant="secondary" size="small" fullWidth={density.width < 520} loading={refreshing} disabled={working} onPress={() => void load(true)} />
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.md }}>
        <VadCard accessibilityRole="summary" style={{ flex: 1.05, borderColor: verified ? theme.colors.yes : retryNeeded || inProgress ? theme.colors.warning : theme.colors.brandPrimary, gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="caption" tone={statusTone}>CURRENT STATUS</VadText>
              <VadText variant="heading" numberOfLines={2}>{statusLabel}</VadText>
            </View>
            <VadChip label={verified ? 'Complete' : inProgress ? 'In progress' : retryNeeded ? 'Action needed' : 'Available'} tone={verified ? 'yes' : inProgress || retryNeeded ? 'warning' : 'brand'} />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            <Fact label="Provider" value={status.providerCode ?? 'Selected'} />
            <Fact label="Level" value={status.verificationLevel ?? 'STANDARD'} />
            <Fact label="Route" value={status.providerConfigured ? 'Ready' : 'Not ready'} tone={status.providerConfigured ? 'yes' : 'warning'} />
            {status.expiresAt ? <Fact label="Expires" value={new Date(status.expiresAt).toLocaleDateString()} tone={retryNeeded ? 'warning' : 'primary'} /> : null}
          </View>

          {lastCheckedAt ? <VadText variant="caption" tone="tertiary">Checked {lastCheckedAt.toLocaleString()}</VadText> : null}
        </VadCard>

        <VadCard variant="raised" style={{ flex: 0.95, gap: theme.spacing.xs }}>
          <VadText variant="bodyStrong">Verification progress</VadText>
          <VerificationStep number="1" label="Start" state={verified || inProgress ? 'complete' : status.providerConfigured ? 'active' : 'blocked'} />
          <VerificationStep number="2" label="Provider review" state={verified ? 'complete' : retryNeeded ? 'blocked' : inProgress ? 'active' : 'waiting'} />
          <VerificationStep number="3" label="Result" state={verified ? 'complete' : retryNeeded ? 'blocked' : 'waiting'} />
        </VadCard>
      </View>

      {!status.providerConfigured && !verified ? <InlineStatus tone="warning" title="Verification route unavailable" message={`${status.providerCode ?? 'The selected provider'} is selected, but its active runtime route is not currently available.`} /> : null}
      {retryNeeded ? <InlineStatus tone="warning" title="Verification can be retried" message={`The last verification ended as ${status.status.replaceAll('_', ' ').toLowerCase()}. Start again when you are ready; backend policy will decide whether the new session can proceed.`} /> : null}
      {actionMessage ? <InlineStatus tone="yes" title="Verification opened" message={actionMessage} /> : null}
      {actionError ? <InlineStatus tone="danger" title="Verification unavailable" message={actionError} /> : null}

      {!verified ? (
        <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
          <VadButton label={startLabel} loading={working} disabled={!status.providerConfigured || refreshing} onPress={() => void start()} style={{ flex: 1 }} />
          {(inProgress || retryNeeded) ? <VadButton label="Refresh now" variant="secondary" loading={refreshing} disabled={working} onPress={() => void load(true)} style={{ flex: 1 }} /> : null}
        </View>
      ) : null}

      <VadCard variant="raised" style={{ gap: 2 }}>
        <VadText variant="bodyStrong">Privacy boundary</VadText>
        <VadText variant="caption" tone="secondary">Identity capture stays with the configured verification provider. VAD uses the provider reference and final verification state for backend policy checks.</VadText>
      </VadCard>
    </View>
  );
}

function Fact({ label, value, tone = 'primary' }: { label: string; value: string; tone?: 'primary' | 'yes' | 'warning' }) {
  const theme = useVadTheme();
  return (
    <View style={{ minWidth: 96, flexGrow: 1, flexBasis: 110, backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="caption" tone={tone} numberOfLines={1}>{value}</VadText>
    </View>
  );
}

function VerificationStep({ number, label, state }: { number: string; label: string; state: 'complete' | 'active' | 'waiting' | 'blocked' }) {
  const theme = useVadTheme();
  const tone = state === 'complete' ? 'yes' : state === 'active' ? 'brand' : state === 'blocked' ? 'warning' : 'tertiary';
  return (
    <View style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: state === 'complete' ? theme.colors.yesSoft : state === 'active' ? theme.colors.brandSoft : state === 'blocked' ? theme.colors.warningSoft : theme.colors.surfaceMuted }}>
        <VadText variant="caption" tone={tone}>{state === 'complete' ? '✓' : number}</VadText>
      </View>
      <VadText variant="caption" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="caption" tone={tone}>{state === 'complete' ? 'DONE' : state === 'active' ? 'ACTIVE' : state === 'blocked' ? 'BLOCKED' : 'WAITING'}</VadText>
    </View>
  );
}

function InlineStatus({ tone, title, message }: { tone: 'yes' | 'warning' | 'danger'; title: string; message: string }) {
  const theme = useVadTheme();
  const borderColor = tone === 'yes' ? theme.colors.yes : tone === 'warning' ? theme.colors.warning : theme.colors.danger;
  const backgroundColor = tone === 'yes' ? theme.colors.yesSoft : tone === 'warning' ? theme.colors.warningSoft : theme.colors.noSoft;
  return (
    <VadCard accessibilityRole="alert" style={{ borderColor, backgroundColor, gap: 2 }}>
      <VadText variant="caption" tone={tone}>{title.toUpperCase()}</VadText>
      <VadText variant="caption" tone="secondary">{message}</VadText>
    </VadCard>
  );
}
