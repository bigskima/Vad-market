import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadText } from '@/components/ui/vad-text';
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

function DeploymentConfigurationScreen() {
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
            DEPLOYMENT CONFIGURATION
          </VadText>
          <VadText variant="title">VAD cannot start yet.</VadText>
          <VadText tone="secondary">
            This deployment was built without the public Supabase configuration
            required by the app. Add the missing variables to the hosting
            project and redeploy.
          </VadText>
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.md,
            gap: theme.spacing.sm,
          }}
        >
          <VadText variant="caption" tone="secondary">
            MISSING BUILD VARIABLES
          </VadText>
          {supabaseConfiguration.missing.map((name) => (
            <VadText key={name} variant="bodyStrong" selectable>
              {name}
            </VadText>
          ))}
        </View>

        <VadText variant="caption" tone="tertiary">
          These are public frontend connection values. Never place a Supabase
          service-role key or provider secret in an EXPO_PUBLIC variable.
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
              <ThemedNavigation />
            </ProductDataProvider>
          </AuthProvider>
        ) : (
          <DeploymentConfigurationScreen />
        )}
      </VadThemeProvider>
    </SafeAreaProvider>
  );
}
