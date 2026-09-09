import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

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
        <VadSkeleton height={110} radius={theme.radius.xl} />
        <VadSkeleton height={72} />
        <VadSkeleton height={72} />
      </View>
    );
  }

  const depositReady = Boolean(readiness?.depositConfigured);
  const withdrawalReady = Boolean(readiness?.withdrawalConfigured);
  const kycReady = Boolean(readiness?.kycConfigured);

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View
        style={{
          borderRadius: theme.radius.xl,
          backgroundColor:
            depositReady || withdrawalReady
              ? theme.colors.brandSoft
              : theme.colors.surfaceRaised,
          padding: theme.spacing.xl,
          gap: theme.spacing.sm,
        }}
      >
        <VadText variant="caption" tone="brand">PAYMENT READINESS</VadText>
        <VadText variant="title">
          {depositReady && withdrawalReady
            ? 'Money movement is configured.'
            : depositReady || withdrawalReady
              ? 'Some payment routes are ready.'
              : 'Payment routes are not ready yet.'}
        </VadText>
        <VadText variant="caption" tone="secondary">
          Live policy still checks identity level, limits and fees for every
          individual payment request.
        </VadText>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
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
          title="Identity provider"
          detail={
            readiness?.kycProvider
              ? readiness.kycProvider + ' verification'
              : 'Verification route'
          }
          ready={kycReady}
          onPress={() => router.push('/account/verification')}
        />
      </View>

      <Pressable
        onPress={() => router.push('/wallet/activity')}
        style={({ pressed }) => ({
          minHeight: 58,
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
        Provider configuration does not bypass KYC, balance, fee or capability
        checks. Those remain backend-authoritative for every request.
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
