import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { runtimeCapabilityReason } from '@/features/policy/runtime-capability-copy';
import { useProductDensity } from '@/hooks/use-product-density';
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
      setError(reason instanceof Error ? reason.message : 'We could not check funding availability right now. Please try again.');
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
    return <VadErrorState title="Funding unavailable" message={error} onRetry={() => { setLoading(true); void load(); }} />;
  }

  const depositReady = Boolean(readiness?.depositConfigured);
  const withdrawalReady = Boolean(readiness?.withdrawalConfigured);
  const kycReady = Boolean(readiness?.kycConfigured);
  const availableCount = [depositReady, withdrawalReady, kycReady].filter(Boolean).length;
  const overallStatus = availableCount === 3
    ? 'Ready'
    : availableCount > 0
      ? 'Some features unavailable'
      : 'Temporarily unavailable';

  return (
    <View style={{ gap: density.sectionGap }}>
      {error ? <VadErrorState title="Could not refresh funding" message={error} onRetry={() => void load()} /> : null}

      <VadCard variant="brand" style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <VadText variant="caption" tone="brand">YOUR MONEY</VadText>
            <VadText variant="heading">Funding & withdrawals</VadText>
            <VadText variant="caption" tone="secondary">
              Check what you can do with your VAD wallet right now.
            </VadText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2, maxWidth: 150 }}>
            <VadText variant="bodyStrong" tone={availableCount === 3 ? 'yes' : availableCount ? 'brand' : 'warning'}>{overallStatus}</VadText>
          </View>
        </View>
      </VadCard>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.md }}>
        <VadCard variant="raised" style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="bodyStrong">Available features</VadText>
          <StatusFact label="Deposits" ready={depositReady} />
          <StatusFact label="Withdrawals" ready={withdrawalReady} />
          <StatusFact label="Identity verification" ready={kycReady} />
        </VadCard>

        <VadCard variant="raised" style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="bodyStrong">For your account</VadText>
          <PolicyFact label="Deposits" allowed={depositAllowed} loading={policyLoading} reason={depositReason} />
          <PolicyFact label="Withdrawals" allowed={withdrawalAllowed} loading={policyLoading} reason={withdrawalReason} />
        </VadCard>
      </View>

      <VadCard style={{ gap: theme.spacing.xs }}>
        <View style={{ gap: 2, marginBottom: theme.spacing.xs }}>
          <VadText variant="bodyStrong">Deposit or withdraw</VadText>
          <VadText variant="caption" tone="secondary">Choose what you want to do. We&apos;ll check the details before you continue.</VadText>
        </View>
        <ReadinessRow
          title="Deposit NGN"
          detail={depositAllowed ? 'Add funds to your VAD wallet' : runtimeCapabilityReason(depositReason)}
          ready={depositReady && depositAllowed}
          statusLabel={policyLoading ? 'CHECKING' : !depositAllowed ? 'UNAVAILABLE' : depositReady ? 'READY' : 'UNAVAILABLE'}
          icon="arrowDown"
          onPress={() => router.push('/wallet/deposit')}
        />
        <ReadinessRow
          title="Withdraw NGN"
          detail={withdrawalAllowed ? 'Move available funds out of your VAD wallet' : runtimeCapabilityReason(withdrawalReason)}
          ready={withdrawalReady && withdrawalAllowed}
          statusLabel={policyLoading ? 'CHECKING' : !withdrawalAllowed ? 'UNAVAILABLE' : withdrawalReady ? 'READY' : 'UNAVAILABLE'}
          icon="arrowUp"
          onPress={() => router.push('/wallet/withdraw')}
        />
        <ReadinessRow
          title="Identity verification"
          detail="Verify your identity when required"
          ready={kycReady}
          statusLabel={kycReady ? 'READY' : 'UNAVAILABLE'}
          icon="account"
          onPress={() => router.push('/account/verification')}
        />
        <ReadinessRow
          title="Payment activity"
          detail="See your deposits, withdrawals and their status"
          ready
          statusLabel="OPEN"
          icon="activity"
          onPress={() => router.push('/wallet/activity')}
        />
      </VadCard>

      <VadCard variant="raised" style={{ gap: 2 }}>
        <VadText variant="caption" tone="secondary">
          Before a transfer starts, VAD checks your available balance, verification, fees and limits.
        </VadText>
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
      <VadChip label={ready ? 'Available' : 'Unavailable'} tone={ready ? 'yes' : 'warning'} />
    </View>
  );
}

function PolicyFact({ label, allowed, loading, reason }: { label: string; allowed: boolean; loading: boolean; reason?: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <VadText variant="caption">{label}</VadText>
        <VadText variant="caption" tone="secondary" numberOfLines={2}>
          {loading ? runtimeCapabilityReason('CAPABILITIES_LOADING') : allowed ? 'Available for your account.' : runtimeCapabilityReason(reason)}
        </VadText>
      </View>
      <VadChip label={loading ? 'Checking' : allowed ? 'Available' : 'Unavailable'} tone={allowed && !loading ? 'yes' : 'warning'} />
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
