import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
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

export function FundingOverview() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    try {
      setReadiness(await getProviderReadiness());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Payment readiness could not be loaded.',
      );
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
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton height={120} radius={theme.radius.xl} />
        <VadSkeleton height={72} />
        <VadSkeleton height={72} />
      </View>
    );
  }

  if (error && !readiness) {
    return (
      <VadErrorState
        title="Payment readiness unavailable"
        message={error}
        onRetry={() => {
          setLoading(true);
          void load();
        }}
      />
    );
  }

  const depositReady = Boolean(readiness?.depositConfigured);
  const withdrawalReady = Boolean(readiness?.withdrawalConfigured);
  const kycReady = Boolean(readiness?.kycConfigured);
  const readyCount = [depositReady, withdrawalReady, kycReady].filter(Boolean)
    .length;

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          alignItems: wide ? 'flex-end' : 'stretch',
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">PAYMENT READINESS</VadText>
          <VadText variant="title">
            {readyCount === 3
              ? 'Wallet routes are ready.'
              : readyCount > 0
                ? 'Some wallet routes still need attention.'
                : 'Wallet routes are not ready yet.'}
          </VadText>
          <VadText tone="secondary">
            Readiness tells you whether the external routes are available.
            Identity, balance, limits and capability checks still happen live
            when you start a payment.
          </VadText>
        </View>

        <View
          style={{
            minWidth: wide ? 260 : undefined,
            gap: 2,
            alignItems: wide ? 'flex-end' : 'flex-start',
          }}
        >
          <VadText variant="caption" tone="secondary">READINESS</VadText>
          <VadText
            variant="display"
            tone={readyCount === 3 ? 'yes' : readyCount ? 'brand' : 'warning'}
          >
            {readyCount}/3
          </VadText>
          <VadText variant="caption" tone="tertiary">
            checks currently available
          </VadText>
        </View>
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <StatusFact label="Deposit route" ready={depositReady} />
        <StatusFact label="Withdrawal route" ready={withdrawalReady} />
        <StatusFact
          label={(readiness?.kycProvider ?? 'Identity') + ' verification'}
          ready={kycReady}
        />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ gap: 2 }}>
          <VadText variant="heading">Money movement</VadText>
          <VadText variant="caption" tone="secondary">
            Each action opens a dedicated reviewed flow.
          </VadText>
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          }}
        >
          <ReadinessRow
            title="Deposit"
            detail="Add NGN to your VAD wallet"
            ready={depositReady}
            onPress={() => router.push('/wallet/deposit')}
          />
          <ReadinessRow
            title="Withdrawal"
            detail="Move available NGN out of VAD"
            ready={withdrawalReady}
            onPress={() => router.push('/wallet/withdraw')}
          />
          <ReadinessRow
            title="Identity verification"
            detail={
              readiness?.kycProvider
                ? readiness.kycProvider + ' verification status'
                : 'Verification route'
            }
            ready={kycReady}
            onPress={() => router.push('/account/verification')}
          />
          <ReadinessRow
            title="Payment activity"
            detail="See deposits, withdrawals and their current state"
            ready
            statusLabel="OPEN"
            onPress={() => router.push('/wallet/activity')}
          />
        </View>
      </View>

      {readiness?.generatedAt ? (
        <VadText variant="caption" tone="tertiary">
          Readiness checked{' '}
          {new Date(readiness.generatedAt).toLocaleString()}.
        </VadText>
      ) : null}

      <VadText variant="caption" tone="tertiary">
        Provider readiness never bypasses identity, balance, fee, limit or
        capability policy. Those checks remain backend-authoritative.
      </VadText>
    </View>
  );
}

function StatusFact({
  label,
  ready,
}: {
  label: string;
  ready: boolean;
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 58,
        paddingVertical: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ready
            ? theme.colors.yesSoft
            : theme.colors.warningSoft,
        }}
      >
        <VadText variant="caption" tone={ready ? 'yes' : 'warning'}>
          {ready ? '✓' : '!'}
        </VadText>
      </View>

      <VadText variant="bodyStrong" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="caption" tone={ready ? 'yes' : 'warning'}>
        {ready ? 'READY' : 'NOT READY'}
      </VadText>
    </View>
  );
}

function ReadinessRow({
  title,
  detail,
  ready,
  statusLabel,
  onPress,
}: {
  title: string;
  detail: string;
  ready: boolean;
  statusLabel?: string;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 76,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">{title}</VadText>
        <VadText variant="caption" tone="secondary">{detail}</VadText>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <VadText variant="caption" tone={ready ? 'yes' : 'warning'}>
          {statusLabel ?? (ready ? 'READY' : 'NOT READY')}
        </VadText>
        <VadText variant="caption" tone="tertiary">›</VadText>
      </View>
    </Pressable>
  );
}
