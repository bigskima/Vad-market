import { router } from 'expo-router';
import { View } from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useVadTheme } from '@/providers/theme-provider';

export default function SendRoute() {
  const theme = useVadTheme();

  return (
    <ProductSubpage title="Send" maxWidth={760}>
      <View style={{ gap: theme.spacing.md }}>
        <VadText variant="caption" tone="secondary">
          Transfer funds securely to another VAD account.
        </VadText>
        <VadEmptyState
          title="Transfers are not available yet"
          body="VAD does not currently have an enabled account-to-account transfer service. No funds have been moved. You can still deposit, withdraw, and review your wallet activity."
          actionLabel="Return to wallet"
          onAction={() => router.replace('/wallet')}
        />
      </View>
    </ProductSubpage>
  );
}
