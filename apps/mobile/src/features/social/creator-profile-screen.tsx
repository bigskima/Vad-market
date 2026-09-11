import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  useWindowDimensions,
  View,
} from 'react-native';

import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { VadButton } from '@/components/ui/vad-button';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
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

export function CreatorProfileScreen({
  username,
}: {
  username: string;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const compact = width < 380;
  const [profile, setProfile] = useState<CreatorPublicProfile | null>(null);
  const [reputation, setReputation] = useState<CreatorReputation | null>(null);
  const [predictions, setPredictions] = useState<CreatorPrediction[]>([]);
  const [following, setFollowing] = useState(false);
  const [followWorking, setFollowWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followError, setFollowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!username.trim()) {
      setError('Creator profile is unavailable.');
      setLoading(false);
      return;
    }

    setError(null);
    setFollowError(null);

    try {
      const nextProfile = await getCreatorPublicProfileByUsername(username);
      if (!nextProfile) {
        throw new Error('No active VAD profile exists for this username.');
      }

      const [nextReputation, nextPredictions] = await Promise.all([
        getCreatorReputation(nextProfile.userId),
        getCreatorPredictionHistory(nextProfile.userId, 20),
      ]);

      setProfile(nextProfile);
      setFollowing(nextProfile.viewerFollows);
      setReputation(nextReputation);
      setPredictions(nextPredictions);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Creator profile is unavailable.',
      );
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);

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
      const authoritativeFollowing = await toggleCreatorFollow(profile.userId);
      setFollowing(authoritativeFollowing);
      setReputation((current) => current ? {
        ...current,
        followers: Math.max(0, previousFollowers + (authoritativeFollowing ? 1 : 0) - (wasFollowing ? 1 : 0)),
      } : current);
    } catch (reason) {
      setFollowing(wasFollowing);
      setReputation((current) => current ? { ...current, followers: previousFollowers } : current);
      setFollowError(reason instanceof Error ? reason.message : 'Follow state could not be updated.');
    } finally {
      setFollowWorking(false);
    }
  }

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton height={wide ? 190 : 132} radius={theme.radius.lg} />
        <VadSkeleton width={compact ? 72 : 84} height={compact ? 72 : 84} radius={42} />
        <VadSkeleton width="58%" height={28} />
        <VadSkeleton height={120} />
      </View>
    );
  }

  if (error || !profile || !reputation) {
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
  const avatarSize = compact ? 72 : 84;

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View style={{ gap: theme.spacing.lg }}>
        <View
          style={{
            height: wide ? 190 : 132,
            overflow: 'hidden',
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.brandSoft,
          }}
        >
          {banner ? (
            <Image
              source={{ uri: banner }}
              resizeMode="cover"
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <View
              style={{
                flex: 1,
                justifyContent: 'flex-end',
                padding: theme.spacing.md,
              }}
            >
              <VadText variant="caption" tone="brand">
                CREATOR PROFILE
              </VadText>
            </View>
          )}
        </View>

        <View
          style={{
            flexDirection: wide ? 'row' : 'column',
            gap: theme.spacing.lg,
            alignItems: wide ? 'flex-end' : 'flex-start',
          }}
        >
          <View
            style={{
              marginTop: wide ? -56 : -46,
              borderWidth: 3,
              borderColor: theme.colors.background,
              borderRadius: theme.radius.pill,
            }}
          >
            <ProfileAvatar
              path={profile.avatarPath}
              name={name}
              size={avatarSize}
            />
          </View>

          <View style={{ flex: 1, width: '100%', gap: theme.spacing.xs }}>
            <VadText variant="title">{name}</VadText>
            <VadText tone="secondary">@{profile.handle}</VadText>
            {profile.bio ? (
              <VadText tone="secondary">{profile.bio}</VadText>
            ) : (
              <VadText variant="caption" tone="secondary">
                Public conviction profile
              </VadText>
            )}
          </View>

          {!profile.isSelf ? (
            <VadButton
              label={following ? 'Following' : 'Follow'}
              variant={following ? 'secondary' : 'primary'}
              fullWidth={!wide}
              loading={followWorking}
              accessibilityState={{ selected: following }}
              onPress={() => void toggleFollow()}
              style={wide ? { minWidth: 124 } : { width: '100%' }}
            />
          ) : null}
        </View>

        {followError ? (
          <VadErrorState
            title="Follow not updated"
            message={followError}
            onRetry={() => void toggleFollow()}
          />
        ) : null}

        <View
          style={{
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.md,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: compact ? theme.spacing.md : theme.spacing.xl,
          }}
        >
          <ProfileStat label="Followers" value={String(reputation.followers)} />
          <ProfileStat label="Following" value={String(reputation.following)} />
          <ProfileStat label="Predictions" value={String(reputation.predictions)} />
          <ProfileStat label="Markets" value={String(reputation.originatedMarkets)} />
        </View>
      </View>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          alignItems: 'flex-start',
        }}
      >
        <View
          style={{
            width: wide ? 250 : '100%',
            gap: theme.spacing.xs,
          }}
        >
          <VadText variant="label" tone="brand">CREATOR SIGNAL</VadText>
          <VadText variant="heading">Track record, not authority.</VadText>
          <VadText variant="caption" tone="secondary">
            Reputation describes published conviction and resolved predictions.
            It never controls oracle truth or settlement.
          </VadText>
        </View>

        <View style={{ flex: 1, width: '100%' }}>
          <CreatorProfilePanel
            reputation={reputation}
            predictions={predictions}
          />
        </View>
      </View>
    </View>
  );
}

function ProfileStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={{ minWidth: 76, flexGrow: 1, flexBasis: 90, gap: 2 }}>
      <VadText variant="bodyStrong">{value}</VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}
