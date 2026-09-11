import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { userFacingErrorMessage } from '@/lib/user-facing-error';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getCreatorPublicProfileByUsername,
  profileMediaUrl,
  type CreatorPublicProfile,
} from '@/services/profile-api';
import {
  getCreatorPredictionHistory,
  getCreatorReputation,
  toggleCreatorFollow,
  type CreatorPrediction,
  type CreatorReputation,
} from '@/services/social-api';
import { CreatorProfilePanel } from './components/creator-profile-panel';

export function CreatorProfileScreen({ username }: { username: string }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 820;
  const [profile, setProfile] = useState<CreatorPublicProfile | null>(null);
  const [reputation, setReputation] = useState<CreatorReputation | null>(null);
  const [predictions, setPredictions] = useState<CreatorPrediction[]>([]);
  const [following, setFollowing] = useState(false);
  const [followWorking, setFollowWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followError, setFollowError] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (!username.trim()) {
      setError('Creator profile is unavailable.');
      setLoading(false);
      return;
    }

    if (background) setRefreshing(true);
    setError(null);
    setFollowError(null);

    try {
      const nextProfile = await getCreatorPublicProfileByUsername(username);
      if (!nextProfile) throw new Error('Creator profile unavailable.');

      const [nextReputation, nextPredictions] = await Promise.all([
        getCreatorReputation(nextProfile.userId),
        getCreatorPredictionHistory(nextProfile.userId, 20),
      ]);

      setProfile(nextProfile);
      setFollowing(nextProfile.viewerFollows);
      setReputation(nextReputation);
      setPredictions(nextPredictions);
    } catch (reason) {
      setError(userFacingErrorMessage(reason, 'social', 'We could not load this creator right now. Please try again.'));
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function toggleFollow() {
    if (!profile || profile.isSelf || followWorking) return;

    const wasFollowing = following;
    const previousFollowers = reputation?.followers ?? 0;
    const optimisticFollowing = !wasFollowing;

    setFollowWorking(true);
    setFollowError(null);
    setFollowing(optimisticFollowing);
    setReputation((current) => current ? {
      ...current,
      followers: Math.max(0, previousFollowers + (optimisticFollowing ? 1 : 0) - (wasFollowing ? 1 : 0)),
    } : current);

    try {
      const updatedFollowing = await toggleCreatorFollow(profile.userId);
      setFollowing(updatedFollowing);
      setReputation((current) => current ? {
        ...current,
        followers: Math.max(0, previousFollowers + (updatedFollowing ? 1 : 0) - (wasFollowing ? 1 : 0)),
      } : current);
    } catch (reason) {
      setFollowing(wasFollowing);
      setReputation((current) => current ? { ...current, followers: previousFollowers } : current);
      setFollowError(userFacingErrorMessage(reason, 'social', 'We could not update this follow right now. Please try again.'));
    } finally {
      setFollowWorking(false);
    }
  }

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton height={wide ? 190 : 132} radius={density.cardRadius} />
        <VadSkeleton width={density.compact ? 72 : 84} height={density.compact ? 72 : 84} radius={42} />
        <VadSkeleton width="58%" height={28} />
        <VadSkeleton height={120} radius={density.cardRadius} />
      </View>
    );
  }

  if ((error && !profile) || !profile || !reputation) {
    return (
      <VadErrorState
        title="Creator profile unavailable"
        message={error ?? 'This creator could not be loaded.'}
        onRetry={() => {
          setLoading(true);
          void load();
        }}
      />
    );
  }

  const name = profile.displayName ?? profile.handle ?? 'VAD creator';
  const banner = profileMediaUrl(profile.bannerPath);
  const avatarSize = density.compact ? 72 : 84;

  return (
    <View style={{ gap: density.sectionGap }}>
      {error ? <VadErrorState title="Could not refresh creator" message={error} onRetry={() => void load(true)} /> : null}

      <VadCard style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ height: wide ? 190 : density.compact ? 108 : 132, backgroundColor: theme.colors.brandSoft }}>
          {banner ? (
            <Image source={{ uri: banner }} accessibilityLabel={`${name} profile banner`} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
          ) : (
            <View style={{ flex: 1, justifyContent: 'flex-end', padding: density.cardPadding, gap: 2 }}>
              <VadText variant="caption" tone="brand">CREATOR PROFILE</VadText>
              <VadText variant="caption" tone="secondary">Public predictions and completed track record.</VadText>
            </View>
          )}
        </View>

        <View style={{ padding: density.cardPadding, gap: theme.spacing.md }}>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.md, alignItems: wide ? 'flex-end' : 'stretch' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.md, flex: 1, minWidth: 0 }}>
              <View style={{ marginTop: wide ? -64 : -52, borderWidth: 3, borderColor: theme.colors.surface, borderRadius: theme.radius.pill }}>
                <ProfileAvatar path={profile.avatarPath} name={name} size={avatarSize} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
                  <VadText variant="title" numberOfLines={1}>{name}</VadText>
                  {profile.isSelf ? <VadChip label="YOU" tone="brand" /> : null}
                </View>
                <VadText variant="caption" tone="secondary" numberOfLines={1}>@{profile.handle}</VadText>
              </View>
            </View>

            <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.xs }}>
              <VadButton label="Refresh" variant="ghost" size="small" fullWidth={!wide && density.narrow} loading={refreshing} disabled={followWorking} onPress={() => void load(true)} />
              {profile.isSelf ? (
                <VadButton label="Edit profile" variant="secondary" size="small" fullWidth={!wide && density.narrow} onPress={() => router.push('/account/profile')} />
              ) : (
                <VadButton
                  label={following ? 'Following' : 'Follow'}
                  variant={following ? 'secondary' : 'primary'}
                  size="small"
                  fullWidth={!wide && density.narrow}
                  loading={followWorking}
                  accessibilityState={{ selected: following }}
                  onPress={() => void toggleFollow()}
                  style={wide ? { minWidth: 124 } : undefined}
                />
              )}
            </View>
          </View>

          <VadText tone="secondary">
            {profile.bio || 'This creator has not added a public bio yet.'}
          </VadText>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            <ProfileStat label="Followers" value={String(reputation.followers)} />
            <ProfileStat label="Following" value={String(reputation.following)} />
            <ProfileStat label="Predictions" value={String(reputation.predictions)} />
            <ProfileStat label="Markets" value={String(reputation.originatedMarkets)} />
          </View>
        </View>
      </VadCard>

      {followError ? (
        <VadErrorState title="Follow not updated" message={followError} onRetry={() => void toggleFollow()} />
      ) : null}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.lg, alignItems: 'flex-start' }}>
        <VadCard variant="muted" style={{ width: wide ? 280 : '100%', gap: theme.spacing.xs }}>
          <VadText variant="caption" tone="brand">ABOUT THIS TRACK RECORD</VadText>
          <VadText variant="heading">Past performance is context, not certainty.</VadText>
          <VadText variant="caption" tone="secondary">
            This profile summarizes published predictions and completed outcomes. Every market is still decided by its own rules and evidence.
          </VadText>
          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: theme.spacing.xs, paddingTop: theme.spacing.sm, gap: 2 }}>
            <VadText variant="caption" tone="tertiary">LAST UPDATED</VadText>
            <VadText variant="caption" tone="secondary">{new Date(reputation.generatedAt).toLocaleString()}</VadText>
          </View>
        </VadCard>

        <View style={{ flex: 1, width: '100%', minWidth: 0 }}>
          <CreatorProfilePanel reputation={reputation} predictions={predictions} />
        </View>
      </View>
    </View>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minWidth: 84, flexGrow: 1, flexBasis: 96, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, gap: 1 }}>
      <VadText variant="bodyStrong">{value}</VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}
