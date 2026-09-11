import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadText } from '@/components/ui/vad-text';
import { ProductTourProvider } from '@/features/tour/tour-provider';
import { supabaseConfiguration } from '@/lib/supabase';
import { AuthProvider } from '@/providers/auth-provider';
import { ProductDataProvider } from '@/providers/product-data-provider';
import {
  VadThemeProvider,
  useVadTheme,
} from '@/providers/theme-provider';

function ThemedNavigation() {
  const theme = useVadTheme();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  return (
    <>
      <StatusBar
        style={theme.mode === 'dark' ? 'light' : 'dark'}
      />
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

function ServiceUnavailableScreen() {
  const theme = useVadTheme();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        padding: theme.spacing.xl,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 620,
          alignSelf: 'center',
          gap: theme.spacing.xl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <VadLogo size={38} />
          <VadText variant="heading">VAD</VadText>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <VadText variant="label" tone="brand">
            SERVICE UNAVAILABLE
          </VadText>
          <VadText variant="title">VAD cannot start right now.</VadText>
          <VadText tone="secondary">
            We are unable to connect to the services needed to open VAD. Please try again shortly. If the problem continues, contact VAD support.
          </VadText>
        </View>

        <VadText variant="caption" tone="tertiary">
          Your account information has not been changed.
        </VadText>
      </View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <VadThemeProvider>
        {supabaseConfiguration.ready ? (
          <AuthProvider>
            <ProductDataProvider>
              <ProductTourProvider>
                <ThemedNavigation />
              </ProductTourProvider>
            </ProductDataProvider>
          </AuthProvider>
        ) : (
          <ServiceUnavailableScreen />
        )}
      </VadThemeProvider>
    </SafeAreaProvider>
  );
}
