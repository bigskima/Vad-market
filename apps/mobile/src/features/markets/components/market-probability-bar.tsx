import { View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function optionalProbability(value: number | string | null) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric) : null;
}

export function MarketProbabilityBar({ yes, no }: { yes: number | string | null; no: number | string | null }) {
  const theme = useVadTheme();
  const yesRaw = optionalProbability(yes);
  const noRaw = optionalProbability(no);

  if (yesRaw == null && noRaw == null) {
    return (
      <View accessibilityRole="summary" accessibilityLabel="Market probability is still forming" style={{ gap: theme.spacing.xs }}>
        <View style={{ height: 8, borderRadius: theme.radius.pill, overflow: 'hidden', backgroundColor: theme.colors.surfaceMuted }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <VadText variant="caption" tone="tertiary">YES —</VadText>
          <VadText variant="caption" tone="tertiary">Price forming</VadText>
          <VadText variant="caption" tone="tertiary">NO —</VadText>
        </View>
      </View>
    );
  }

  const yesValue = yesRaw ?? clamp(1 - (noRaw ?? 0));
  const noValue = noRaw ?? clamp(1 - yesValue);
  const total = yesValue + noValue;
  const yesShare = total > 0 ? yesValue / total : 0.5;
  const noShare = total > 0 ? noValue / total : 0.5;
  const yesPercent = Math.round(yesShare * 100);
  const noPercent = Math.round(noShare * 100);

  return (
    <View accessibilityRole="summary" accessibilityLabel={`YES ${yesPercent} percent, NO ${noPercent} percent`} style={{ gap: theme.spacing.xs }}>
      <View style={{ height: 8, borderRadius: theme.radius.pill, overflow: 'hidden', flexDirection: 'row', backgroundColor: theme.colors.surfaceMuted }}>
        <View style={{ flex: yesShare, backgroundColor: theme.colors.yes }} />
        <View style={{ flex: noShare, backgroundColor: theme.colors.no }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <VadText variant="caption" tone="yes">YES {yesPercent}%</VadText>
        <VadText variant="caption" tone="no">NO {noPercent}%</VadText>
      </View>
    </View>
  );
}
