import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { pct } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import type { CreatorPrediction, CreatorReputation } from '@/services/social-api';

export function CreatorProfilePanel({ reputation, predictions }: { reputation: CreatorReputation; predictions: CreatorPrediction[] }) {
  const theme = useVadTheme();

  return <View style={{ gap: theme.spacing.lg }}>
    <VadCard variant="raised" style={{ gap: theme.spacing.md, borderRadius: theme.radius.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: theme.spacing.md }}>
        <View style={{ gap: theme.spacing.xxs }}>
          <VadText variant="caption" tone="secondary">Evidence-weighted reputation</VadText>
          <VadText variant="display" tone="brand">{reputation.evidenceWeightedReputation}%</VadText>
        </View>
        <VadText variant="caption" tone="tertiary">{reputation.resolvedPredictions} resolved</VadText>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
        <SignalMetric label="Accuracy" value={reputation.accuracy == null ? '—' : pct(reputation.accuracy)} />
        <SignalMetric label="Calibration" value={reputation.calibrationScore == null ? '—' : pct(reputation.calibrationScore)} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        <SmallMetric label="Correct" value={String(reputation.correctPredictions)} />
        <SmallMetric label="Posts" value={String(reputation.posts)} />
        <SmallMetric label="Following" value={String(reputation.following)} />
        <SmallMetric label="Markets" value={String(reputation.originatedMarkets)} />
      </View>

      <VadText variant="caption" tone="secondary">Descriptive reputation only. Oracle resolution and settlement remain independent.</VadText>
    </VadCard>

    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <VadText variant="heading">Resolved conviction</VadText>
        <VadText variant="caption" tone="secondary">{predictions.length} shown</VadText>
      </View>

      {predictions.length ? predictions.slice(0, 8).map((item) => {
        const resultTone = item.correct === true ? 'yes' : item.correct === false ? 'no' : 'secondary';
        const resultLabel = item.resolution_status === 'FINAL'
          ? item.correct ? 'Correct' : 'Missed'
          : 'Unresolved';

        return <VadCard key={item.post_public_id} variant="outlined" style={{ gap: theme.spacing.sm, borderRadius: theme.radius.lg }}>
          <VadText variant="bodyStrong" numberOfLines={2}>{item.market_title}</VadText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
            <View style={{ borderRadius: theme.radius.pill, backgroundColor: item.stance_outcome_code === 'YES' ? theme.colors.yesSoft : theme.colors.noSoft, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xxs }}>
              <VadText variant="caption" tone={item.stance_outcome_code === 'YES' ? 'yes' : 'no'}>{item.stance_outcome_code}</VadText>
            </View>
            {item.resolved_outcome_code ? <VadText variant="caption" tone="secondary">Resolved {item.resolved_outcome_code}</VadText> : null}
            <VadText variant="caption" tone={resultTone}>{resultLabel}</VadText>
          </View>
          {item.body ? <VadText variant="caption" tone="secondary" numberOfLines={2}>{item.body}</VadText> : null}
        </VadCard>;
      }) : <VadCard variant="muted"><VadText tone="secondary">No resolved prediction history is available yet.</VadText></VadCard>}
    </View>
  </View>;
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return <VadCard variant="muted" style={{ flex: 1, gap: theme.spacing.xxs, padding: theme.spacing.sm }}>
    <VadText variant="heading">{value}</VadText>
    <VadText variant="caption" tone="secondary">{label}</VadText>
  </VadCard>;
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return <View style={{ width: '47%', minWidth: 112, gap: theme.spacing.xxs, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.xs }}>
    <VadText variant="bodyStrong">{value}</VadText>
    <VadText variant="caption" tone="secondary">{label}</VadText>
  </View>;
}
