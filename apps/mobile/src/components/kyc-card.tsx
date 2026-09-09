import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getMyKycStatus,
  startDiditKyc,
  type KycStatus,
} from '@/services/identity-api';

export function KycCard() {
  const theme = useVadTheme();
  const [status, setStatus] = useState<KycStatus>({
    status: 'NOT_STARTED',
    providerCode: 'DIDIT',
    providerConfigured: false,
  });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await getMyKycStatus());
    } catch {
      // Keep the safe default state when the status endpoint is unavailable.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
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
      Alert.alert(
        'Verification unavailable',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton height={110} radius={theme.radius.xl} />
        <VadSkeleton height={58} />
        <VadSkeleton height={58} />
      </View>
    );
  }

  const verified = status.status === 'VERIFIED';
  const inProgress = ['CREATED', 'PROVIDER_PENDING', 'IN_REVIEW'].includes(
    status.status,
  );
  const statusTone = verified
    ? 'yes'
    : inProgress
      ? 'warning'
      : status.providerConfigured
        ? 'brand'
        : 'secondary';
  const statusLabel = verified
    ? 'VERIFIED'
    : !status.providerConfigured
      ? 'SETUP PENDING'
      : status.status.replaceAll('_', ' ');

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View
        style={{
          borderRadius: theme.radius.xl,
          backgroundColor: verified
            ? theme.colors.yesSoft
            : inProgress
              ? theme.colors.warningSoft
              : theme.colors.surfaceRaised,
          padding: theme.spacing.xl,
          gap: theme.spacing.sm,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: theme.spacing.sm,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="caption" tone={statusTone}>
              IDENTITY STATUS
            </VadText>
            <VadText variant="title">
              {verified
                ? 'Identity verified'
                : inProgress
                  ? 'Verification in progress'
                  : 'Verify your identity'}
            </VadText>
          </View>

          <View
            style={{
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surface,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
            }}
          >
            <VadText variant="caption" tone={statusTone}>
              {statusLabel}
            </VadText>
          </View>
        </View>

        <VadText variant="caption" tone="secondary">
          {status.providerCode} · {status.verificationLevel ?? 'STANDARD'}
        </VadText>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        <VerificationStep
          label="Start verification"
          detail={
            status.providerConfigured
              ? 'Provider route is available.'
              : 'Provider route is not configured.'
          }
          state={
            verified || inProgress
              ? 'complete'
              : status.providerConfigured
                ? 'active'
                : 'blocked'
          }
        />
        <VerificationStep
          label="Provider review"
          detail={
            inProgress
              ? 'Your verification is being processed.'
              : verified
                ? 'Provider review completed.'
                : 'Begins after you submit verification.'
          }
          state={verified ? 'complete' : inProgress ? 'active' : 'waiting'}
        />
        <VerificationStep
          label="Verified"
          detail={
            verified
              ? 'Identity assurance can now be used by live capability policy.'
              : 'Unlocks only the capabilities that require this verification level.'
          }
          state={verified ? 'complete' : 'waiting'}
        />
      </View>

      {!status.providerConfigured && !verified ? (
        <View
          style={{
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.warningSoft,
            padding: theme.spacing.md,
            gap: 2,
          }}
        >
          <VadText variant="caption" tone="warning">
            VERIFICATION ROUTE UNAVAILABLE
          </VadText>
          <VadText variant="caption" tone="secondary">
            {status.providerCode} is selected, but its active runtime route is not
            currently available.
          </VadText>
        </View>
      ) : null}

      {!verified ? (
        <VadButton
          label={inProgress ? 'Continue verification' : 'Start verification'}
          loading={working}
          disabled={!status.providerConfigured}
          onPress={() => void start()}
        />
      ) : (
        <Pressable
          onPress={() => void load()}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <VadText variant="label" tone="brand">Refresh status</VadText>
        </Pressable>
      )}

      <VadText variant="caption" tone="tertiary">
        Verification is provider-hosted. VAD stores the provider reference and
        resulting verification state, not the raw identity-document payload.
      </VadText>
    </View>
  );
}

function VerificationStep({
  label,
  detail,
  state,
}: {
  label: string;
  detail: string;
  state: 'complete' | 'active' | 'waiting' | 'blocked';
}) {
  const theme = useVadTheme();
  const tone =
    state === 'complete'
      ? 'yes'
      : state === 'active'
        ? 'brand'
        : state === 'blocked'
          ? 'warning'
          : 'tertiary';

  return (
    <View
      style={{
        minHeight: 72,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        gap: theme.spacing.md,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            state === 'complete'
              ? theme.colors.yesSoft
              : state === 'active'
                ? theme.colors.brandSoft
                : state === 'blocked'
                  ? theme.colors.warningSoft
                  : theme.colors.surfaceRaised,
        }}
      >
        <VadText variant="caption" tone={tone}>
          {state === 'complete' ? '✓' : state === 'active' ? '•' : '–'}
        </VadText>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">{label}</VadText>
        <VadText variant="caption" tone="secondary">{detail}</VadText>
      </View>
    </View>
  );
}
