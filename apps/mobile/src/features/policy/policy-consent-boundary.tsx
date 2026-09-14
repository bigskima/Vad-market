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
    return (
      <AccountReadyScreen
        title="Getting your account ready"
        message="Reconnecting securely and restoring your VAD experience."
      />
    );
  }

  if (!session || isPasswordRecovery) return <Redirect href="/" />;

  if (policyGate.loading) {
    return (
      <AccountReadyScreen
        title="Getting your account ready"
        message="Preparing your access, preferences and latest VAD experience."
      />
    );
  }

  if (policyGate.error) {
    return (
      <AccountReadyScreen
        title="We couldn't finish getting things ready"
        message="Your account is safe. Try again to continue into VAD."
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
            Review the latest important information to continue. Your guided app tour begins only after this step is finished.
          </VadText>
        </View>
      </View>
    </View>
  );
}

function AccountReadyScreen({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useVadTheme();

  return (
    <ViewportFrame>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={title}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.xl,
          backgroundColor: theme.colors.background,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 360,
            alignItems: 'center',
            gap: theme.spacing.lg,
          }}
        >
          <View
            style={{
              width: 92,
              height: 92,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              ...theme.shadows.subtle,
            }}
          >
            <VadLogo size={62} />
          </View>

          <View style={{ alignItems: 'center', gap: 7 }}>
            <VadText variant="heading" style={{ textAlign: 'center' }}>{title}</VadText>
            <VadText variant="caption" tone="secondary" style={{ textAlign: 'center', maxWidth: 320 }}>
              {message}
            </VadText>
          </View>

          {actionLabel && onAction ? (
            <VadButton label={actionLabel} fullWidth={false} onPress={onAction} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {[0, 1, 2].map((item) => (
                <View
                  key={item}
                  style={{
                    width: item === 1 ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: item === 1 ? theme.colors.brandPrimary : theme.colors.borderStrong,
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </ViewportFrame>
  );
}
