import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

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
  const { width } = useWindowDimensions();
  const wide = width >= 760;
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
        throw new Error(
          'The verification link could not be opened on this device.',
        );
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
        <VadSkeleton height={140} radius={theme.radius.xl} />
        <VadSkeleton height={72} />
        <VadSkeleton height={72} />
      </View>
    );
  }

  const verified = status.status === 'VERIFIED';
  const inProgress = [
    'CREATED',
    'PROVIDER_PENDING',
    'IN_REVIEW',
  ].includes(status.status);

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
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.md,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1.05,
            borderRadius: theme.radius.xl,
            backgroundColor: verified
              ? theme.colors.yesSoft
              : inProgress
                ? theme.colors.warningSoft
                : theme.colors.surfaceRaised,
            padding: theme.spacing.xl,
            gap: theme.spacing.md,
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

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              paddingTop: theme.spacing.md,
              gap: theme.spacing.xs,
            }}
          >
            <StatusFact
              label="Provider"
              value={status.providerCode ?? 'DIDIT'}
            />
            <StatusFact
              label="Level"
              value={status.verificationLevel ?? 'STANDARD'}
            />
            <StatusFact
              label="Route"
              value={
                status.providerConfigured ? 'Configured' : 'Not configured'
              }
            />
          </View>
        </View>

        <View
          style={{
            flex: 0.95,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          }}
        >
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
            state={
              verified
                ? 'complete'
                : inProgress
                  ? 'active'
                  : 'waiting'
            }
          />
          <VerificationStep
            label="Verified"
            detail={
              verified
                ? 'Identity assurance can now be used by live capability policy.'
                : 'Verification unlocks only the capabilities that require it.'
            }
            state={verified ? 'complete' : 'waiting'}
          />
        </View>
      </View>

      {!status.providerConfigured && !verified ? (
        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.warning,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.warningSoft,
            padding: theme.spacing.md,
            gap: 2,
          }}
        >
          <VadText variant="caption" tone="warning">
            VERIFICATION ROUTE UNAVAILABLE
          </VadText>
          <VadText variant="caption" tone="secondary">
            {status.providerCode} is selected, but its active runtime route is
            not currently available.
          </VadText>
        </View>
      ) : null}

      {!verified ? (
        <VadButton
          label={
            inProgress
              ? 'Continue verification'
              : 'Start verification'
          }
          loading={working}
          disabled={!status.providerConfigured}
          onPress={() => void start()}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => void load()}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            minHeight: 38,
            justifyContent: 'center',
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

function StatusFact({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'space-between',
      }}
    >
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <VadText variant="caption">{value}</VadText>
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
        minHeight: 76,
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
          {state === 'complete'
            ? '✓'
            : state === 'active'
              ? '•'
              : '–'}
        </VadText>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">{label}</VadText>
        <VadText variant="caption" tone="secondary">{detail}</VadText>
      </View>
    </View>
  );
}
