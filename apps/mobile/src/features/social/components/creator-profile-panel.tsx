import { useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadText } from '@/components/ui/vad-text';
import { pct } from '@/features/markets/format';
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
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const [tab, setTab] = useState<CreatorTab>('signal');

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View
        style={{
          flexDirection: 'row',
          padding: theme.spacing.xxs,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surfaceRaised,
        }}
      >
        <Tab
          label="Signal"
          selected={tab === 'signal'}
          onPress={() => setTab('signal')}
        />
        <Tab
          label={'Predictions ' + predictions.length}
          selected={tab === 'predictions'}
          onPress={() => setTab('predictions')}
        />
      </View>

      {tab === 'signal' ? (
        <View style={{ gap: theme.spacing.xl }}>
          <View
            style={{
              flexDirection: wide ? 'row' : 'column',
              alignItems: 'stretch',
              gap: theme.spacing.md,
            }}
          >
            <View
              style={{
                flex: 1.1,
                borderRadius: theme.radius.xl,
                backgroundColor: theme.colors.brandSoft,
                padding: theme.spacing.xl,
                gap: theme.spacing.sm,
              }}
            >
              <VadText variant="caption" tone="brand">
                EVIDENCE-WEIGHTED REPUTATION
              </VadText>
              <VadText variant="display" tone="brand">
                {reputation.evidenceWeightedReputation}%
              </VadText>
              <VadText variant="caption" tone="secondary">
                Based on {reputation.resolvedPredictions} resolved predictions.
              </VadText>
            </View>

            <View
              style={{
                flex: 0.9,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: theme.colors.border,
                paddingVertical: theme.spacing.md,
                paddingHorizontal: wide ? theme.spacing.md : 0,
                flexDirection: 'row',
                gap: theme.spacing.xl,
                alignItems: 'center',
              }}
            >
              <SignalMetric
                label="Accuracy"
                value={
                  reputation.accuracy == null
                    ? '—'
                    : pct(reputation.accuracy)
                }
              />
              <SignalMetric
                label="Calibration"
                value={
                  reputation.calibrationScore == null
                    ? '—'
                    : pct(reputation.calibrationScore)
                }
              />
            </View>
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
            <MetricRow
              label="Correct predictions"
              value={String(reputation.correctPredictions)}
            />
            <MetricRow
              label="Published posts"
              value={String(reputation.posts)}
            />
            <MetricRow
              label="Following"
              value={String(reputation.following)}
            />
            <MetricRow
              label="Originated markets"
              value={String(reputation.originatedMarkets)}
            />
          </View>

          <VadText variant="caption" tone="tertiary">
            This reputation is descriptive only. Oracle resolution and
            settlement remain independent.
          </VadText>
        </View>
      ) : (
        <PredictionHistory predictions={predictions} />
      )}
    </View>
  );
}

function PredictionHistory({
  predictions,
}: {
  predictions: CreatorPrediction[];
}) {
  const theme = useVadTheme();

  if (!predictions.length) {
    return (
      <VadEmptyState
        title="No resolved prediction history"
        body="Resolved creator predictions will appear here as the track record grows."
      />
    );
  }

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      }}
    >
      {predictions.slice(0, 12).map((item) => {
        const resultTone =
          item.correct === true
            ? 'yes'
            : item.correct === false
              ? 'no'
              : 'secondary';

        const resultLabel =
          item.resolution_status === 'FINAL'
            ? item.correct
              ? 'Correct'
              : 'Missed'
            : 'Unresolved';

        const stanceTone =
          item.stance_outcome_code === 'YES' ? 'yes' : 'no';

        return (
          <View
            key={item.post_public_id}
            style={{
              minHeight: 92,
              paddingVertical: theme.spacing.md,
              gap: theme.spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: theme.spacing.md,
                alignItems: 'flex-start',
              }}
            >
              <VadText
                variant="bodyStrong"
                numberOfLines={2}
                style={{ flex: 1 }}
              >
                {item.market_title}
              </VadText>

              <VadText variant="caption" tone={resultTone}>
                {resultLabel}
              </VadText>
            </View>

            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.xs,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <View
                style={{
                  borderRadius: theme.radius.pill,
                  backgroundColor:
                    item.stance_outcome_code === 'YES'
                      ? theme.colors.yesSoft
                      : theme.colors.noSoft,
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: theme.spacing.xxs,
                }}
              >
                <VadText variant="caption" tone={stanceTone}>
                  Called {item.stance_outcome_code}
                </VadText>
              </View>

              {item.resolved_outcome_code ? (
                <VadText variant="caption" tone="secondary">
                  Resolved {item.resolved_outcome_code}
                </VadText>
              ) : null}
            </View>

            {item.body ? (
              <VadText
                variant="caption"
                tone="secondary"
                numberOfLines={2}
              >
                {item.body}
              </VadText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Tab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: selected ? theme.colors.surface : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <VadText
        variant="label"
        tone={selected ? 'brand' : 'secondary'}
      >
        {label}
      </VadText>
    </Pressable>
  );
}

function SignalMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 90, gap: 2 }}>
      <VadText variant="heading">{value}</VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}

function MetricRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 54,
        paddingVertical: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <VadText
        variant="caption"
        tone="secondary"
        style={{ flex: 1 }}
      >
        {label}
      </VadText>
      <VadText variant="bodyStrong">{value}</VadText>
    </View>
  );
}
