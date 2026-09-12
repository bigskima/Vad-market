import { Stack } from 'expo-router';

import { PolicyConsentBoundary } from '@/features/policy/policy-consent-boundary';
import { ProductTourProvider } from '@/features/tour/tour-provider';
import { ProductDataProvider } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function ProductLayout() {
  const theme = useVadTheme();

  // The root Stack must stay mounted while this gate checks the account.
  // Data and the tour start only after the required policies are accepted.
  return (
    <PolicyConsentBoundary>
      <ProductDataProvider>
        <ProductTourProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.colors.background },
              animation: 'fade',
            }}
          />
        </ProductTourProvider>
      </ProductDataProvider>
    </PolicyConsentBoundary>
  );
}
