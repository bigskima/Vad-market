import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { pct } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import type { CreatorPrediction, CreatorReputation } from '@/services/social-api';

export function CreatorProfilePanel({ reputation, predictions }: { reputation: CreatorReputation; predictions: CreatorPrediction[] }) {
  const theme = useVadTheme();
  const metrics = [
    ['Reputation', `${reputation.evidenceWeightedReputation}%`],
    ['Accuracy', reputation.accuracy == null ? '—' : pct(reputation.accuracy)],
    ['Calibration', reputation.calibrationScore == null ? '—' : pct(reputation.calibrationScore)],
    ['Followers', String(reputation.followers)],
    ['Resolved', String(reputation.resolvedPredictions)],
    ['Markets', String(reputation.originatedMarkets)],
  ];
  return <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>{metrics.map(([label, value]) => <VadCard key={label} variant="muted" style={{ minWidth: 96, flexGrow: 1, gap: theme.spacing.xxs, padding: theme.spacing.sm }}><VadText variant="heading" tone={label === 'Reputation' ? 'brand' : 'primary'}>{value}</VadText><VadText variant="caption" tone="secondary">{label}</VadText></VadCard>)}</View>
    <VadText variant="caption" tone="secondary">Evidence-weighted reputation is descriptive. It does not control oracle resolution or settlement.</VadText>
    {predictions.length ? <View style={{ gap: theme.spacing.xs }}><VadText variant="label">Recent resolved conviction</VadText>{predictions.slice(0, 4).map((item) => <View key={item.post_public_id} style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.xs }}><VadText variant="bodyStrong" numberOfLines={2}>{item.market_title}</VadText><VadText variant="caption" tone={item.correct === true ? 'yes' : item.correct === false ? 'no' : 'secondary'}>{item.stance_outcome_code}{item.resolution_status === 'FINAL' ? ` → ${item.resolved_outcome_code} · ${item.correct ? 'Correct' : 'Missed'}` : ' · unresolved'}</VadText></View>)}</View> : null}
  </VadCard>;
}
