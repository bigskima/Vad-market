import { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadErrorState } from '@/components/ui/vad-error-state';
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
  const compact = width < 380;
  const [status, setStatus] = useState<KycStatus>({
    status: 'NOT_STARTED',
    providerCode: 'DIDIT',
    providerConfigured: false,
  });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    try {
      setStatus(await getMyKycStatus());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Verification status could not be loaded.',
      );
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
    setActionError(null);
    setActionMessage(null);

    try {
      const session = await startDiditKyc();

      if (!(await Linking.canOpenURL(session.verificationUrl))) {
        throw new Error(
          'The verification link could not be opened on this device.',
        );
      }

      await Linking.openURL(session.verificationUrl);
      setActionMessage(
        'Verification opened with the identity provider. Return here and refresh your status when you finish.',
      );
      void load();
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : 'Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton height={124} radius={theme.radius.lg} />
        <VadSkeleton height={68} />
        <VadSkeleton height={68} />
      </View>
    );
  }

  if (error) {
    return (
      <VadErrorState
        title="Verification status unavailable"
        message={error}
        onRetry={() => {
          setLoading(true);
          void load();
        }}
      />
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
          gap: theme.spacing.xl,
          alignItems: 'stretch',
        }}
      >
        <View
          style={{
            flex: 1.05,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: verified
              ? theme.colors.yes
              : inProgress
                ? theme.colors.warning
                : theme.colors.border,
            paddingVertical: theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: compact ? 'column' : 'row',
              alignItems: compact ? 'flex-start' : 'flex-start',
              justifyContent: 'space-between',
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

            <VadText variant="caption" tone={statusTone}>
              {statusLabel}
            </VadText>
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
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
            number="1"
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
            number="2"
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
            number="3"
            label="Verified"
            detail={
              verified
                ? 'Identity assurance can now be used by live capability policy.'
                : 'Verification unlocks only capabilities that require it.'
            }
            state={verified ? 'complete' : 'waiting'}
          />
        </View>
      </View>

      {!status.providerConfigured && !verified ? (
        <InlineStatus
          tone="warning"
          title="Verification route unavailable"
          message={
            (status.providerCode ?? 'The selected provider') +
            ' is selected, but its active runtime route is not currently available.'
          }
        />
      ) : null}

      {actionMessage ? (
        <InlineStatus
          tone="yes"
          title="Verification opened"
          message={actionMessage}
        />
      ) : null}

      {actionError ? (
        <InlineStatus
          tone="danger"
          title="Verification unavailable"
          message={actionError}
        />
      ) : null}

      {!verified ? (
        <View
          style={{
            flexDirection: compact ? 'column' : 'row',
            gap: theme.spacing.sm,
          }}
        >
          <VadButton
            label={inProgress ? 'Continue verification' : 'Start verification'}
            loading={working}
            disabled={!status.providerConfigured}
            onPress={() => void start()}
            style={{ flex: 1 }}
          />
          {inProgress ? (
            <VadButton
              label="Refresh status"
              variant="secondary"
              disabled={working}
              onPress={() => void load()}
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
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
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <VadText variant="caption" tone="secondary" style={{ flex: 1 }}>
        {label}
      </VadText>
      <VadText variant="bodyStrong">{value}</VadText>
    </View>
  );
}

function VerificationStep({
  number,
  label,
  detail,
  state,
}: {
  number: string;
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
        alignItems: 'flex-start',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <VadText variant="label" tone={tone}>{number}</VadText>

      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">{label}</VadText>
        <VadText variant="caption" tone="secondary">{detail}</VadText>
      </View>

      <VadText variant="caption" tone={tone}>
        {state === 'complete'
          ? 'DONE'
          : state === 'active'
            ? 'ACTIVE'
            : state === 'blocked'
              ? 'BLOCKED'
              : 'WAITING'}
      </VadText>
    </View>
  );
}

function InlineStatus({
  tone,
  title,
  message,
}: {
  tone: 'yes' | 'warning' | 'danger';
  title: string;
  message: string;
}) {
  const theme = useVadTheme();
  const borderColor =
    tone === 'yes'
      ? theme.colors.yes
      : tone === 'warning'
        ? theme.colors.warning
        : theme.colors.danger;
  const backgroundColor =
    tone === 'yes'
      ? theme.colors.yesSoft
      : tone === 'warning'
        ? theme.colors.warningSoft
        : theme.colors.noSoft;

  return (
    <View
      style={{
        borderLeftWidth: 3,
        borderLeftColor: borderColor,
        backgroundColor,
        padding: theme.spacing.md,
        gap: 2,
      }}
    >
      <VadText variant="caption" tone={tone}>{title.toUpperCase()}</VadText>
      <VadText variant="caption" tone="secondary">{message}</VadText>
    </View>
  );
}
