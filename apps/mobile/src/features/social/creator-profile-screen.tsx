import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { getCreatorPredictionHistory, getCreatorReputation, type CreatorPrediction, type CreatorReputation } from '@/services/social-api';
import { CreatorProfilePanel } from './components/creator-profile-panel';

export function CreatorProfileScreen({ creatorUserId }: { creatorUserId: string }) {
  const theme = useVadTheme();
  const [reputation, setReputation] = useState<CreatorReputation | null>(null);
  const [predictions, setPredictions] = useState<CreatorPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextReputation, nextPredictions] = await Promise.all([getCreatorReputation(creatorUserId), getCreatorPredictionHistory(creatorUserId, 20)]);
      setReputation(nextReputation);
      setPredictions(nextPredictions);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Creator profile is unavailable.'); }
    finally { setLoading(false); }
  }, [creatorUserId]);

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  if (loading) return <View style={{ gap: theme.spacing.sm }}><VadSkeleton height={34} width="60%" /><VadSkeleton height={150} /><VadSkeleton height={110} /></View>;
  if (error || !reputation) return <VadErrorState title="Creator profile unavailable" body={error ?? 'This creator could not be loaded.'} onRetry={() => void load()} />;

  return <ScrollView contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}>
    <View style={{ gap: theme.spacing.xxs }}><VadText variant="label" tone="brand">CREATOR REPUTATION</VadText><VadText variant="title">Conviction history</VadText><VadText tone="secondary">Reputation is based on published evidence and resolved predictions. It never decides market truth.</VadText></View>
    <CreatorProfilePanel reputation={reputation} predictions={predictions} />
  </ScrollView>;
}
