import { Redirect, usePathname } from 'expo-router';
import { type ReactNode } from 'react';
import { View } from 'react-native';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadText } from '@/components/ui/vad-text';
import { ViewportFrame } from '@/components/ui/viewport-frame';
import { PolicyConsentModal } from '@/features/policy/policy-consent-modal';
import { usePolicyGate } from '@/hooks/use-policy-gate';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function PolicyConsentBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isLoading, isPasswordRecovery, session } = useAuth();
  const policyGate = usePolicyGate(
    !isLoading && !isPasswordRecovery ? session?.user.id : null,
  );

  if (isLoading) {
    return <PolicyCheckScreen message="Restoring your account…" />;
  }

  if (!session || isPasswordRecovery) return <Redirect href="/" />;

  if (policyGate.loading) return <PolicyCheckScreen />;

  if (policyGate.error) {
    return (
      <PolicyCheckScreen
        message={policyGate.error}
        actionLabel="Try again"
        onAction={() => void policyGate.refresh()}
      />
    );
  }

  const needsAgreement = Boolean(
    policyGate.enforcementReady
      && policyGate.requiresAcceptance
      && policyGate.requiredDocuments.length,
  );

  if (needsAgreement && pathname !== '/home') {
    return <Redirect href="/home" />;
  }

  if (needsAgreement) {
    return (
      <ViewportFrame>
        <PolicyHomeBackdrop />
        <PolicyConsentModal
          documents={policyGate.requiredDocuments}
          onAccepted={policyGate.refresh}
        />
      </ViewportFrame>
    );
  }

  return children;
}

function PolicyHomeBackdrop() {
  const theme = useVadTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          minHeight: 62,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          paddingHorizontal: theme.spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <VadLogo size={36} />
        <View style={{ gap: 1 }}>
          <VadText variant="bodyStrong">VAD</VadText>
          <VadText variant="caption" tone="secondary">Home</VadText>
        </View>
      </View>

      <View
        style={{
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
        }}
      >
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.xl,
            backgroundColor: theme.colors.surface,
            padding: theme.spacing.lg,
            gap: theme.spacing.sm,
          }}
        >
          <VadText variant="caption" tone="brand">VAD HOME</VadText>
          <VadText variant="heading">Your account is ready.</VadText>
          <VadText tone="secondary">
            Complete the required policy review to enter VAD. Your guided app tour will begin only after the policy step is finished.
          </VadText>
        </View>
      </View>
    </View>
  );
}

function PolicyCheckScreen({
  message = 'Checking the current VAD policies for your account…',
  actionLabel,
  onAction,
}: {
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useVadTheme();
  return (
    <ViewportFrame>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: theme.spacing.xl,
          backgroundColor: theme.colors.background,
        }}
      >
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <VadLogo size={38} />
            <VadText variant="heading">VAD</VadText>
          </View>
          <View style={{ gap: 5 }}>
            <VadText variant="caption" tone="brand">ACCOUNT CHECK</VadText>
            <VadText variant="title">Before you continue</VadText>
            <VadText tone="secondary">{message}</VadText>
          </View>
          {actionLabel && onAction ? <VadButton label={actionLabel} onPress={onAction} /> : null}
        </View>
      </View>
    </ViewportFrame>
  );
}
