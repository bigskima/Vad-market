import { Redirect, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { type ReactNode, useEffect } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadText } from '@/components/ui/vad-text';
import { GrowthAttributionBridge } from '@/features/growth/growth-attribution-bridge';
import { PolicyConsentModal } from '@/features/policy/policy-consent-modal';
import { ProductTourProvider } from '@/features/tour/tour-provider';
import { usePolicyGate } from '@/hooks/use-policy-gate';
import { supabaseConfiguration } from '@/lib/supabase';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { ProductDataProvider } from '@/providers/product-data-provider';
import { VadThemeProvider, useVadTheme } from '@/providers/theme-provider';

function ThemedNavigation() {
  const theme = useVadTheme();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'fade',
        }}
      />
    </>
  );
}

function ViewportFrame({ children }: { children: ReactNode }) {
  const theme = useVadTheme();
  const { width, height } = useWindowDimensions();

  return (
    <View
      style={{
        flex: 1,
        width,
        height,
        minWidth: width,
        minHeight: height,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: theme.colors.background,
      }}
    >
      {children}
    </View>
  );
}

function PolicyConsentBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isLoading, isPasswordRecovery, session } = useAuth();
  const policyRoute = pathname === '/policy-consent';
  const authRoute = pathname === '/';
  const growthLandingRoute = pathname.startsWith('/a/');
  const gateApplies = Boolean(
    !isLoading
      && session
      && !isPasswordRecovery
      && !policyRoute
      && !authRoute
      && !growthLandingRoute,
  );
  const policyGate = usePolicyGate(gateApplies ? session?.user.id : null);

  if (gateApplies && policyGate.loading) {
    return <PolicyCheckScreen />;
  }

  if (gateApplies && policyGate.error) {
    return (
      <PolicyCheckScreen
        message={policyGate.error}
        actionLabel="Try again"
        onAction={() => void policyGate.refresh()}
      />
    );
  }

  const needsAgreement = Boolean(
    gateApplies
      && policyGate.enforcementReady
      && policyGate.requiresAcceptance
      && policyGate.requiredDocuments.length,
  );

  if (needsAgreement && pathname !== '/home') {
    return <Redirect href="/home" />;
  }

  if (needsAgreement && pathname === '/home') {
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

function ServiceUnavailableScreen() {
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
        <View style={{ width: '100%', maxWidth: 620, alignSelf: 'center', gap: theme.spacing.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <VadLogo size={38} />
            <VadText variant="heading">VAD</VadText>
          </View>
          <View style={{ gap: theme.spacing.sm }}>
            <VadText variant="label" tone="brand">SERVICE UNAVAILABLE</VadText>
            <VadText variant="title">VAD cannot start right now.</VadText>
            <VadText tone="secondary">We are unable to connect to the services needed to open VAD. Please try again shortly. If the problem continues, contact VAD support.</VadText>
          </View>
          <VadText variant="caption" tone="tertiary">Your account information has not been changed.</VadText>
        </View>
      </View>
    </ViewportFrame>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <VadThemeProvider>
        {supabaseConfiguration.ready ? (
          <AuthProvider>
            <GrowthAttributionBridge>
              <PolicyConsentBoundary>
                <ProductDataProvider>
                  <ProductTourProvider>
                    <ThemedNavigation />
                  </ProductTourProvider>
                </ProductDataProvider>
              </PolicyConsentBoundary>
            </GrowthAttributionBridge>
          </AuthProvider>
        ) : <ServiceUnavailableScreen />}
      </VadThemeProvider>
    </SafeAreaProvider>
  );
}
