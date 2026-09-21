import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function CryptoWalletConnections() {
  const theme = useVadTheme();

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 3 }}>
        <VadText variant="caption" tone="brand">SELF-CUSTODY USDC</VadText>
        <VadText variant="heading">VAD embedded wallet</VadText>
        <VadText variant="caption" tone="secondary">
          VAD&apos;s embedded-wallet activation is native-app first. Your normal VAD account continues to use Supabase authentication.
        </VadText>
      </View>
      <VadText variant="caption" tone="tertiary">
        Web wallet activation will be enabled after the native sandbox flow is validated.
      </VadText>
    </VadCard>
  );
}
