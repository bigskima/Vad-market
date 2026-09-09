import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

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

  const load = useCallback(async () => {
    try {
      setReadiness(await getProviderReadiness());
    } catch {
      setReadiness(null);
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
        <VadSkeleton height={130} radius={theme.radius.xl} />
        <VadSkeleton height={72} />
        <VadSkeleton height={72} />
      </View>
    );
  }

  const depositReady = Boolean(readiness?.depositConfigured);
  const withdrawalReady = Boolean(readiness?.withdrawalConfigured);
  const kycReady = Boolean(readiness?.kycConfigured);
  const readyCount = [depositReady, withdrawalReady, kycReady].filter(Boolean)
    .length;

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.md,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1.1,
            borderRadius: theme.radius.xl,
            backgroundColor:
              readyCount === 3
                ? theme.colors.yesSoft
                : readyCount > 0
                  ? theme.colors.brandSoft
                  : theme.colors.surfaceRaised,
            padding: theme.spacing.xl,
            gap: theme.spacing.sm,
          }}
        >
          <VadText
            variant="caption"
            tone={readyCount === 3 ? 'yes' : 'brand'}
          >
            PAYMENT READINESS
          </VadText>
          <VadText variant="title">
            {readyCount === 3
              ? 'Wallet routes are ready.'
              : readyCount > 0
                ? 'Some wallet routes still need attention.'
                : 'Wallet routes are not ready yet.'}
          </VadText>
          <VadText variant="caption" tone="secondary">
            {readyCount} of 3 readiness checks are currently available.
          </VadText>
        </View>

        <View
          style={{
            flex: 0.9,
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
            justifyContent: 'center',
          }}
        >
          <StatusFact label="Deposit" ready={depositReady} />
          <StatusFact label="Withdrawal" ready={withdrawalReady} />
          <StatusFact
            label={readiness?.kycProvider ?? 'Identity'}
            ready={kycReady}
          />
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <VadText variant="heading">Money movement</VadText>
        <VadText variant="caption" tone="secondary">
          Open the dedicated flow for the action you want to perform.
        </VadText>

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
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/wallet/activity')}
        style={({ pressed }) => ({
          minHeight: 64,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          paddingHorizontal: theme.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          opacity: pressed ? 0.65 : 1,
        })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="bodyStrong">Payment activity</VadText>
          <VadText variant="caption" tone="secondary">
            See deposit and withdrawal intents and their current status.
          </VadText>
        </View>
        <VadText variant="heading" tone="tertiary">›</VadText>
      </Pressable>

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
        minHeight: 38,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ready
            ? theme.colors.yesSoft
            : theme.colors.surfaceRaised,
        }}
      >
        <VadText variant="caption" tone={ready ? 'yes' : 'tertiary'}>
          {ready ? '✓' : '–'}
        </VadText>
      </View>
      <VadText variant="caption" style={{ flex: 1 }}>{label}</VadText>
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
  onPress,
}: {
  title: string;
  detail: string;
  ready: boolean;
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
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ready
            ? theme.colors.yesSoft
            : theme.colors.surfaceRaised,
        }}
      >
        <VadText variant="caption" tone={ready ? 'yes' : 'tertiary'}>
          {ready ? '✓' : '–'}
        </VadText>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">{title}</VadText>
        <VadText variant="caption" tone="secondary">{detail}</VadText>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <VadText variant="caption" tone={ready ? 'yes' : 'warning'}>
          {ready ? 'READY' : 'NOT READY'}
        </VadText>
        <VadText variant="caption" tone="tertiary">›</VadText>
      </View>
    </Pressable>
  );
}
