import { View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

function clamp(value: number) { return Math.max(0, Math.min(1, value)); }

export function MarketProbabilityBar({ yes, no }: { yes: number | string | null; no: number | string | null }) {
  const theme = useVadTheme();
  const yesValue = clamp(Number(yes ?? 0));
  const noValue = clamp(Number(no ?? Math.max(0, 1 - yesValue)));
  const total = yesValue + noValue || 1;
  const yesShare = yesValue / total;
  const noShare = noValue / total;

  return <View style={{ gap: theme.spacing.xs }}>
    <View style={{ height: 8, borderRadius: theme.radius.pill, overflow: 'hidden', flexDirection: 'row', backgroundColor: theme.colors.surfaceMuted }}>
      <View style={{ flex: yesShare, backgroundColor: theme.colors.yes }} />
      <View style={{ flex: noShare, backgroundColor: theme.colors.no }} />
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <VadText variant="caption" tone="yes">YES {Math.round(yesShare * 100)}%</VadText>
      <VadText variant="caption" tone="no">NO {Math.round(noShare * 100)}%</VadText>
    </View>
  </View>;
}
