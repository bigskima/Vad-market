import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function TngnDemoAdminControl() {
  const theme = useVadTheme();

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 4 }}>
        <VadText variant="caption" tone="tertiary">PLATFORM NOTICE</VadText>
        <VadText variant="heading">TNGN sandbox retired</VadText>
        <VadText variant="caption" tone="secondary">
          Test NGN trading has been decommissioned. New TNGN demo trades, practice markets and user opt-ins are disabled. Historical sandbox orders and ledger entries remain preserved for audit and are not real NGN funds.
        </VadText>
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, gap: 4 }}>
        <VadText variant="bodyStrong">Use the real NGN wallet</VadText>
        <VadText variant="caption" tone="secondary">
          NGN wallet activity remains subject to verified funding, eligibility, available balance and the normal ledger controls. No real-money balance is created by this retirement.
        </VadText>
      </View>
    </VadCard>
  );
}
