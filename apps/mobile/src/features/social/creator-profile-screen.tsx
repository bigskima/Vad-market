import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { VadCard } from '@/components/ui/vad-card';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { getCreatorPublicProfile, profileMediaUrl, type CreatorPublicProfile } from '@/services/profile-api';
import { getCreatorPredictionHistory, getCreatorReputation, type CreatorPrediction, type CreatorReputation } from '@/services/social-api';
import { CreatorProfilePanel } from './components/creator-profile-panel';

export function CreatorProfileScreen({ creatorUserId }: { creatorUserId: string }) {
  const theme = useVadTheme();
  const [profile, setProfile] = useState<CreatorPublicProfile | null>(null);
  const [reputation, setReputation] = useState<CreatorReputation | null>(null);
  const [predictions, setPredictions] = useState<CreatorPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextProfile, nextReputation, nextPredictions] = await Promise.all([getCreatorPublicProfile(creatorUserId), getCreatorReputation(creatorUserId), getCreatorPredictionHistory(creatorUserId, 20)]);
      setProfile(nextProfile); setReputation(nextReputation); setPredictions(nextPredictions);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Creator profile is unavailable.'); }
    finally { setLoading(false); }
  }, [creatorUserId]);

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  if (loading) return <View style={{ gap: theme.spacing.sm }}><VadSkeleton height={150} /><VadSkeleton height={80} width={80} /><VadSkeleton height={150} /></View>;
  if (error || !reputation) return <VadErrorState title="Creator profile unavailable" message={error ?? 'This creator could not be loaded.'} onRetry={() => void load()} />;

  const name = profile?.displayName ?? profile?.handle ?? 'VAD creator';
  const banner = profileMediaUrl(profile?.bannerPath);
  return <ScrollView contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}>
    <VadCard variant="raised" style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ height: 150, backgroundColor: theme.colors.brandSoft }}>{banner ? <Image source={{ uri: banner }} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : null}</View>
      <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
        <View style={{ marginTop: -55, alignSelf: 'flex-start', borderWidth: 4, borderColor: theme.colors.surface, borderRadius: 60 }}><ProfileAvatar path={profile?.avatarPath} name={name} size={92} /></View>
        <View><VadText variant="title">{name}</VadText>{profile?.handle ? <VadText tone="secondary">@{profile.handle}</VadText> : null}</View>
        {profile?.bio ? <VadText>{profile.bio}</VadText> : null}
      </View>
    </VadCard>
    <View style={{ gap: theme.spacing.xxs }}><VadText variant="label" tone="brand">CREATOR REPUTATION</VadText><VadText variant="heading">Conviction history</VadText><VadText tone="secondary">Reputation is based on published evidence and resolved predictions. It never decides market truth.</VadText></View>
    <CreatorProfilePanel reputation={reputation} predictions={predictions} />
  </ScrollView>;
}
