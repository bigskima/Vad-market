import { View } from 'react-native';
import { useState } from 'react';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { pct } from '@/features/markets/format';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type {
  CreatorPrediction,
  CreatorReputation,
} from '@/services/social-api';

type CreatorTab = 'signal' | 'predictions';

export function CreatorProfilePanel({
  reputation,
  predictions,
}: {
  reputation: CreatorReputation;
  predictions: CreatorPrediction[];
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 820;
  const [tab, setTab] = useState<CreatorTab>('signal');

  return (
    <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <VadSegmentedControl
        value={tab}
        options={[
          { value: 'signal', label: 'Track record' },
          { value: 'predictions', label: `Predictions ${predictions.length}` },
        ] as const}
        onChange={setTab}
      />

      {tab === 'signal' ? (
        <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.md }}>
            <VadCard variant="brand" style={{ flex: 1.15, gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
                <VadText variant="caption" tone="brand">VAD TRACK RECORD</VadText>
                <VadChip label={`${reputation.resolvedPredictions} resolved`} />
              </View>
              <VadText variant={density.compact ? 'title' : 'display'} tone="brand" numberOfLines={1} adjustsFontSizeToFit>
                {reputation.evidenceWeightedReputation}%
              </VadText>
              <VadText variant="caption" tone="secondary">
                A summary score based on this creator’s completed prediction history. Use it as context, not as a guarantee of future results.
              </VadText>
            </VadCard>

            <VadCard variant="raised" style={{ flex: 0.85, gap: theme.spacing.sm }}>
              <VadText variant="bodyStrong">Resolved performance</VadText>
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <SignalMetric
                  label="Accuracy"
                  value={reputation.accuracy == null ? '—' : pct(reputation.accuracy)}
                  detail={`${reputation.correctPredictions} correct`}
                />
                <SignalMetric
                  label="Calibration"
                  value={reputation.calibrationScore == null ? '—' : pct(reputation.calibrationScore)}
                  detail={`${reputation.calibratedPredictions} scored`}
                />
              </View>
            </VadCard>
          </View>

          <VadCard variant="raised" style={{ gap: 0 }}>
            <VadText variant="bodyStrong" style={{ marginBottom: theme.spacing.xs }}>Creator activity</VadText>
            <MetricRow label="Resolved predictions" value={String(reputation.resolvedPredictions)} />
            <MetricRow label="Correct predictions" value={String(reputation.correctPredictions)} />
            <MetricRow label="Published posts" value={String(reputation.posts)} />
            <MetricRow label="Markets created" value={String(reputation.originatedMarkets)} />
          </VadCard>

          <VadCard variant="muted" style={{ gap: 2 }}>
            <VadText variant="caption" tone="brand">ABOUT THIS SCORE</VadText>
            <VadText variant="bodyStrong">A track record is not a final verdict.</VadText>
            <VadText variant="caption" tone="secondary">
              Creator performance can help you evaluate someone’s past reasoning. Every market is still resolved using its own published rules and evidence.
            </VadText>
          </VadCard>
        </View>
      ) : (
        <PredictionHistory predictions={predictions} />
      )}
    </View>
  );
}

function PredictionHistory({ predictions }: { predictions: CreatorPrediction[] }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const grid = density.width >= 760;

  if (!predictions.length) {
    return (
      <VadEmptyState
        title="No prediction history yet"
        body="Published market predictions will appear here as this creator builds a public track record."
      />
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 2 }}>
        <VadText variant="heading">Prediction history</VadText>
        <VadText variant="caption" tone="secondary">See this creator’s published calls and how completed markets turned out.</VadText>
      </View>

      <View style={{ flexDirection: grid ? 'row' : 'column', flexWrap: grid ? 'wrap' : 'nowrap', gap: theme.spacing.sm }}>
        {predictions.slice(0, 20).map((item) => {
          const resolved = item.resolution_status === 'FINAL';
          const resultTone = item.correct === true ? 'yes' : item.correct === false ? 'no' : 'secondary';
          const resultLabel = resolved ? item.correct ? 'Correct' : 'Missed' : 'Unresolved';
          const stanceTone = item.stance_outcome_code === 'YES' ? 'yes' : 'no';

          return (
            <VadCard
              key={item.post_public_id}
              variant="raised"
              style={{ width: grid ? '48.9%' : '100%', minHeight: grid ? 174 : undefined, gap: theme.spacing.sm }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <VadText variant="bodyStrong" numberOfLines={3}>{item.market_title}</VadText>
                  <VadText variant="caption" tone="tertiary">{new Date(item.created_at).toLocaleDateString()}</VadText>
                </View>
                <VadChip label={resultLabel} tone={resultTone === 'secondary' ? 'neutral' : resultTone} />
              </View>

              <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap', alignItems: 'center' }}>
                <VadChip label={`Called ${item.stance_outcome_code}`} tone={stanceTone} />
                {item.confidence != null ? <VadChip label={`Confidence ${pct(item.confidence)}`} /> : null}
                {item.resolved_outcome_code ? <VadChip label={`Result ${item.resolved_outcome_code}`} tone={item.resolved_outcome_code === 'YES' ? 'yes' : 'no'} /> : null}
              </View>

              {item.body ? <VadText variant="caption" tone="secondary" numberOfLines={3}>{item.body}</VadText> : null}

              {item.finalized_at ? (
                <VadText variant="caption" tone="tertiary" style={{ marginTop: 'auto' }}>
                  Completed {new Date(item.finalized_at).toLocaleDateString()}
                </VadText>
              ) : null}
            </VadCard>
          );
        })}
      </View>
    </View>
  );
}

function SignalMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, padding: theme.spacing.sm, gap: 1 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="heading" numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
      <VadText variant="caption" tone="secondary" numberOfLines={1}>{detail}</VadText>
    </View>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 48, paddingVertical: theme.spacing.xs, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone="secondary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
    </View>
  );
}
