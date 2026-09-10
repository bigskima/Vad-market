import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { runtimeCapabilityReason } from '@/features/policy/runtime-capability-copy';
import { useVadTheme } from '@/providers/theme-provider';
import { getProviderReadiness } from '@/services/payment-api';

type Readiness = {
  countryCode?: string;
  kycProvider?: string;
  kycConfigured?: boolean;
  depositConfigured?: boolean;
  withdrawalConfigured?: boolean;
  generatedAt?: string;
};

export function FundingOverview({
  depositAllowed,
  withdrawalAllowed,
  depositReason,
  withdrawalReason,
  policyLoading = false,
}: {
  depositAllowed: boolean;
  withdrawalAllowed: boolean;
  depositReason?: string;
  withdrawalReason?: string;
  policyLoading?: boolean;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 760;
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReadiness(await getProviderReadiness());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Payment readiness could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.sm }}>
        <VadSkeleton height={density.compact ? 96 : 112} radius={density.cardRadius} />
        <VadSkeleton height={96} radius={density.cardRadius} />
        <VadSkeleton height={126} radius={density.cardRadius} />
      </View>
    );
  }

  if (error && !readiness) {
    return <VadErrorState title="Payment readiness unavailable" message={error} onRetry={() => { setLoading(true); void load(); }} />;
  }

  const depositReady = Boolean(readiness?.depositConfigured);
  const withdrawalReady = Boolean(readiness?.withdrawalConfigured);
  const kycReady = Boolean(readiness?.kycConfigured);
  const providerReadyCount = [depositReady, withdrawalReady, kycReady].filter(Boolean).length;

  return (
    <View style={{ gap: density.sectionGap }}>
      {error ? <VadErrorState title="Payment readiness refresh failed" message={error} onRetry={() => void load()} /> : null}

      <VadCard variant="brand" style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <VadText variant="caption" tone="brand">FUNDING & WITHDRAWALS</VadText>
            <VadText variant="heading">Money movement readiness</VadText>
            <VadText variant="caption" tone="secondary">Provider setup and account policy are checked separately before money moves.</VadText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <VadText variant="display" tone={providerReadyCount === 3 ? 'yes' : providerReadyCount ? 'brand' : 'warning'}>{providerReadyCount}/3</VadText>
            <VadText variant="caption" tone="tertiary">routes ready</VadText>
          </View>
        </View>
      </VadCard>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.md }}>
        <VadCard variant="raised" style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="bodyStrong">External routes</VadText>
          <StatusFact label="Deposit provider" ready={depositReady} />
          <StatusFact label="Withdrawal provider" ready={withdrawalReady} />
          <StatusFact label={`${readiness?.kycProvider ?? 'Identity'} verification`} ready={kycReady} />
        </VadCard>

        <VadCard variant="raised" style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="bodyStrong">Account policy</VadText>
          <PolicyFact label="Deposits" allowed={depositAllowed} loading={policyLoading} reason={depositReason} />
          <PolicyFact label="Withdrawals" allowed={withdrawalAllowed} loading={policyLoading} reason={withdrawalReason} />
        </VadCard>
      </View>

      <VadCard style={{ gap: theme.spacing.xs }}>
        <View style={{ gap: 2, marginBottom: theme.spacing.xs }}>
          <VadText variant="bodyStrong">Money movement</VadText>
          <VadText variant="caption" tone="secondary">Each action opens its dedicated reviewed flow and checks live policy again.</VadText>
        </View>
        <ReadinessRow title="Deposit NGN" detail={depositAllowed ? 'Add funds to your VAD wallet' : runtimeCapabilityReason(depositReason)} ready={depositReady && depositAllowed} statusLabel={policyLoading ? 'CHECKING' : !depositAllowed ? 'BLOCKED' : depositReady ? 'READY' : 'ROUTE OFF'} icon="arrowDown" onPress={() => router.push('/wallet/deposit')} />
        <ReadinessRow title="Withdraw NGN" detail={withdrawalAllowed ? 'Move available funds out' : runtimeCapabilityReason(withdrawalReason)} ready={withdrawalReady && withdrawalAllowed} statusLabel={policyLoading ? 'CHECKING' : !withdrawalAllowed ? 'BLOCKED' : withdrawalReady ? 'READY' : 'ROUTE OFF'} icon="arrowUp" onPress={() => router.push('/wallet/withdraw')} />
        <ReadinessRow title="Identity verification" detail={readiness?.kycProvider ? `${readiness.kycProvider} verification status` : 'Verification route'} ready={kycReady} statusLabel={kycReady ? 'READY' : 'CHECK'} icon="account" onPress={() => router.push('/account/verification')} />
        <ReadinessRow title="Payment activity" detail="Deposits, withdrawals and current states" ready statusLabel="OPEN" icon="activity" onPress={() => router.push('/wallet/activity')} />
      </VadCard>

      <VadCard variant="raised" style={{ gap: 2 }}>
        <VadText variant="caption" tone="secondary">Provider readiness never bypasses identity, balance, fee, limit or capability policy. Those checks remain backend-authoritative.</VadText>
        {readiness?.generatedAt ? <VadText variant="caption" tone="tertiary">Checked {new Date(readiness.generatedAt).toLocaleString()}</VadText> : null}
      </VadCard>
    </View>
  );
}

function StatusFact({ label, ready }: { label: string; ready: boolean }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ready ? theme.colors.yesSoft : theme.colors.warningSoft }}>
        <VadText variant="caption" tone={ready ? 'yes' : 'warning'}>{ready ? '✓' : '!'}</VadText>
      </View>
      <VadText variant="caption" style={{ flex: 1 }}>{label}</VadText>
      <VadChip label={ready ? 'Ready' : 'Not ready'} tone={ready ? 'yes' : 'warning'} />
    </View>
  );
}

function PolicyFact({ label, allowed, loading, reason }: { label: string; allowed: boolean; loading: boolean; reason?: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <VadText variant="caption">{label}</VadText>
        <VadText variant="caption" tone="secondary" numberOfLines={2}>{loading ? runtimeCapabilityReason('CAPABILITIES_LOADING') : allowed ? 'Enabled by current account policy.' : runtimeCapabilityReason(reason)}</VadText>
      </View>
      <VadChip label={loading ? 'Checking' : allowed ? 'Enabled' : 'Blocked'} tone={allowed && !loading ? 'yes' : 'warning'} />
    </View>
  );
}

function ReadinessRow({ title, detail, ready, statusLabel, icon, onPress }: { title: string; detail: string; ready: boolean; statusLabel: string; icon: 'arrowDown' | 'arrowUp' | 'account' | 'activity'; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border, opacity: pressed ? 0.66 : 1 })}>
      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: ready ? theme.colors.yesSoft : theme.colors.surfaceRaised }}>
        <VadIcon name={icon} size={17} tone={ready ? 'yes' : 'secondary'} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <VadText variant="bodyStrong">{title}</VadText>
        <VadText variant="caption" tone="secondary" numberOfLines={2}>{detail}</VadText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <VadText variant="caption" tone={ready ? 'yes' : 'warning'}>{statusLabel}</VadText>
        <VadIcon name="chevronRight" size={14} tone="tertiary" />
      </View>
    </Pressable>
  );
}
