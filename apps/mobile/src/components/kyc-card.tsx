import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
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
  const wide = width >= 820;
  const compact = width < 380;
  const appState = useRef(AppState.currentState);
  const [status, setStatus] = useState<KycStatus>({
    status: 'NOT_STARTED',
    providerCode: 'DIDIT',
    providerConfigured: false,
  });
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
      setStatus(await getMyKycStatus());
      setLastCheckedAt(new Date());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Verification status could not be loaded.',
      );
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

      if (wasAway && nextState === 'active') {
        void load(true);
      }
    });

    return () => subscription.remove();
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
        'Verification opened with the identity provider. VAD will refresh your status when you return to the app.',
      );
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
        <VadSkeleton height={wide ? 164 : 124} radius={theme.radius.lg} />
        <VadSkeleton height={72} />
        <VadSkeleton height={72} />
      </View>
    );
  }

  if (error && !lastCheckedAt) {
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
  const failed = ['FAILED', 'REJECTED'].some((value) =>
    status.status.toUpperCase().includes(value),
  );

  const statusTone = verified
    ? 'yes'
    : failed
      ? 'danger'
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
    <View style={{ gap: theme.spacing.xxl }}>
      {error ? (
        <VadErrorState
          title="Verification refresh failed"
          message={error}
          onRetry={() => void load(true)}
        />
      ) : null}

      <View
        style={{
          flexDirection: width >= 620 ? 'row' : 'column',
          alignItems: width >= 620 ? 'flex-end' : 'stretch',
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">IDENTITY VERIFICATION</VadText>
          <VadText variant="title">
            {verified
              ? 'Your identity is verified.'
              : inProgress
                ? 'Verification is in progress.'
                : failed
                  ? 'Verification needs attention.'
                  : 'Verify your identity when required.'}
          </VadText>
          <VadText tone="secondary">
            Verification is provider-hosted. VAD uses the resulting status for
            live policy checks without displaying raw identity documents here.
          </VadText>
        </View>

        <VadButton
          label="Refresh status"
          variant="secondary"
          size="small"
          fullWidth={width < 520}
          loading={refreshing}
          onPress={() => void load(true)}
        />
      </View>

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
            borderLeftWidth: 3,
            borderLeftColor:
              verified
                ? theme.colors.yes
                : failed
                  ? theme.colors.danger
                  : inProgress
                    ? theme.colors.warning
                    : theme.colors.brandPrimary,
            backgroundColor:
              verified
                ? theme.colors.yesSoft
                : failed
                  ? theme.colors.noSoft
                  : inProgress
                    ? theme.colors.warningSoft
                    : theme.colors.brandSoft,
            padding: compact ? theme.spacing.md : theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: compact ? 'column' : 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: theme.spacing.sm,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="caption" tone={statusTone}>CURRENT STATUS</VadText>
              <VadText variant="heading">{statusLabel}</VadText>
            </View>
            <VadText variant="caption" tone={statusTone}>
              {verified ? 'COMPLETE' : inProgress ? 'IN PROGRESS' : failed ? 'ACTION NEEDED' : 'AVAILABLE'}
            </VadText>
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            <StatusFact label="Provider" value={status.providerCode ?? 'Selected provider'} />
            <StatusFact label="Level" value={status.verificationLevel ?? 'STANDARD'} />
            <StatusFact label="Route" value={status.providerConfigured ? 'Configured' : 'Not configured'} />
          </View>

          {lastCheckedAt ? (
            <VadText variant="caption" tone="tertiary">
              Last checked {lastCheckedAt.toLocaleString()}
            </VadText>
          ) : null}
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
                ? 'The provider route is available from this account.'
                : 'The provider route is not configured yet.'
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
                  : failed
                    ? 'The previous attempt did not complete successfully.'
                    : 'Begins after you submit verification.'
            }
            state={
              verified
                ? 'complete'
                : failed
                  ? 'blocked'
                  : inProgress
                    ? 'active'
                    : 'waiting'
            }
          />
          <VerificationStep
            number="3"
            label="Verification result"
            detail={
              verified
                ? 'The verified state can now be used by live capability policy.'
                : 'A verified result unlocks only capabilities whose backend policy requires it.'
            }
            state={verified ? 'complete' : failed ? 'blocked' : 'waiting'}
          />
        </View>
      </View>

      {!status.providerConfigured && !verified ? (
        <InlineStatus
          tone="warning"
          title="Verification route unavailable"
          message={`${status.providerCode ?? 'The selected provider'} is selected, but its active runtime route is not currently available.`}
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
            label={
              inProgress
                ? 'Continue verification'
                : failed
                  ? 'Start another verification'
                  : 'Start verification'
            }
            loading={working}
            disabled={!status.providerConfigured}
            onPress={() => void start()}
            style={{ flex: 1 }}
          />
          {(inProgress || failed) ? (
            <VadButton
              label="Refresh now"
              variant="secondary"
              loading={refreshing}
              disabled={working}
              onPress={() => void load(true)}
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
      ) : null}

      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          paddingVertical: theme.spacing.md,
          gap: 2,
        }}
      >
        <VadText variant="bodyStrong">Privacy boundary</VadText>
        <VadText variant="caption" tone="secondary">
          This VAD screen stores and displays provider references and resulting
          verification state. Identity capture itself remains on the configured
          provider flow.
        </VadText>
      </View>
    </View>
  );
}

function StatusFact({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 46,
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
        minHeight: 76,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        gap: theme.spacing.md,
        alignItems: 'flex-start',
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
        <VadText variant="caption" tone={tone}>{number}</VadText>
      </View>

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
      accessibilityRole="alert"
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
