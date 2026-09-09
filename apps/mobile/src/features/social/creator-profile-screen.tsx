import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  useWindowDimensions,
  View,
} from 'react-native';

import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getCreatorPublicProfile,
  profileMediaUrl,
  type CreatorPublicProfile,
} from '@/services/profile-api';
import {
  getCreatorPredictionHistory,
  getCreatorReputation,
  type CreatorPrediction,
  type CreatorReputation,
} from '@/services/social-api';
import { CreatorProfilePanel } from './components/creator-profile-panel';

export function CreatorProfileScreen({
  creatorUserId,
}: {
  creatorUserId: string;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const [profile, setProfile] = useState<CreatorPublicProfile | null>(null);
  const [reputation, setReputation] = useState<CreatorReputation | null>(null);
  const [predictions, setPredictions] = useState<CreatorPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!creatorUserId) {
      setError('Creator profile is unavailable.');
      setLoading(false);
      return;
    }

    setError(null);

    try {
      const [nextProfile, nextReputation, nextPredictions] =
        await Promise.all([
          getCreatorPublicProfile(creatorUserId),
          getCreatorReputation(creatorUserId),
          getCreatorPredictionHistory(creatorUserId, 20),
        ]);

      setProfile(nextProfile);
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
  }, [creatorUserId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);

    return () => clearTimeout(timer);
  }, [load]);

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton height={wide ? 220 : 172} radius={theme.radius.xl} />
        <VadSkeleton width={92} height={92} radius={46} />
        <VadSkeleton width="58%" height={30} />
        <VadSkeleton height={130} />
      </View>
    );
  }

  if (error || !reputation) {
    return (
      <VadErrorState
        title="Creator profile unavailable"
        message={error ?? 'This creator could not be loaded.'}
        onRetry={() => void load()}
      />
    );
  }

  const name =
    profile?.displayName ?? profile?.handle ?? 'VAD creator';
  const banner = profileMediaUrl(profile?.bannerPath);

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View
        style={{
          borderRadius: theme.radius.xl,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <View
          style={{
            height: wide ? 220 : 172,
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
                padding: theme.spacing.lg,
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
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.lg,
            gap: theme.spacing.lg,
          }}
        >
          <View
            style={{
              marginTop: -50,
              flexDirection: wide ? 'row' : 'column',
              alignItems: wide ? 'flex-end' : 'flex-start',
              justifyContent: 'space-between',
              gap: theme.spacing.lg,
            }}
          >
            <View
              style={{
                borderWidth: 4,
                borderColor: theme.colors.surface,
                borderRadius: theme.radius.pill,
              }}
            >
              <ProfileAvatar
                path={profile?.avatarPath}
                name={name}
                size={96}
              />
            </View>

            {wide ? (
              <View
                style={{
                  flexDirection: 'row',
                  gap: theme.spacing.xl,
                  paddingBottom: theme.spacing.xs,
                }}
              >
                <ProfileStat
                  label="Followers"
                  value={String(reputation.followers)}
                />
                <ProfileStat
                  label="Predictions"
                  value={String(reputation.predictions)}
                />
                <ProfileStat
                  label="Markets"
                  value={String(reputation.originatedMarkets)}
                />
              </View>
            ) : null}
          </View>

          <View
            style={{
              flexDirection: wide ? 'row' : 'column',
              gap: theme.spacing.xl,
              alignItems: wide ? 'flex-end' : 'stretch',
            }}
          >
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              <View style={{ gap: 2 }}>
                <VadText variant="title">{name}</VadText>
                {profile?.handle ? (
                  <VadText tone="secondary">@{profile.handle}</VadText>
                ) : null}
              </View>

              {profile?.bio ? (
                <VadText tone="secondary">{profile.bio}</VadText>
              ) : (
                <VadText variant="caption" tone="secondary">
                  Public conviction profile
                </VadText>
              )}
            </View>

            {!wide ? (
              <View
                style={{
                  flexDirection: 'row',
                  gap: theme.spacing.xl,
                  flexWrap: 'wrap',
                }}
              >
                <ProfileStat
                  label="Followers"
                  value={String(reputation.followers)}
                />
                <ProfileStat
                  label="Predictions"
                  value={String(reputation.predictions)}
                />
                <ProfileStat
                  label="Markets"
                  value={String(reputation.originatedMarkets)}
                />
              </View>
            ) : null}
          </View>
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
            width: wide ? 260 : '100%',
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
    <View style={{ minWidth: 76, gap: 2 }}>
      <VadText variant="bodyStrong">{value}</VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}
