import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/providers/auth-provider';
import { ProductDataProvider } from '@/providers/product-data-provider';
import { VadThemeProvider, useVadTheme } from '@/providers/theme-provider';

function ThemedNavigation() {
  const theme = useVadTheme();

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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <VadThemeProvider>
        <AuthProvider>
          <ProductDataProvider>
            <ThemedNavigation />
          </ProductDataProvider>
        </AuthProvider>
      </VadThemeProvider>
    </SafeAreaProvider>
  );
}
