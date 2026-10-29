import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getPublishedPlayExperience,
  listExperiencePlayCampaigns,
  playFriendlyError,
  type PlayCampaign,
  type PlayExperience,
  playExperienceLabel,
} from '@/services/play-api';
import { PlayAdSlot } from './play-ad-slot';
import { PlayCampaignSummary } from './play-campaign-summary';
import { PlayMessageState } from './play-states';
import { PlayExperienceDetailSkeleton } from '@/components/ui/screen-skeletons';
import { PlayTabNavigation } from './play-tab-navigation';
import { PlayPracticeGamePanel } from './play-practice-game-panel';
import { playMediaPublicUrl } from '@/services/play-media-api';

export function PlayExperienceDetailScreen() {
  const theme = useVadTheme();
  const params = useLocalSearchParams<{ experienceSlug?: string | string[] }>();
  const slug = Array.isArray(params.experienceSlug) ? params.experienceSlug[0] : params.experienceSlug;
  const [experience, setExperience] = useState<PlayExperience | null>(null);
  const [campaigns, setCampaigns] = useState<PlayCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async (experienceId: string) => {
    try {
      setCampaigns(await listExperiencePlayCampaigns(experienceId));
      setCampaignError(null);
    } catch (reason) {
      setCampaigns([]);
      setCampaignError(playFriendlyError(reason));
    }
  }, []);

  const load = useCallback(async () => {
    if (!slug) {
      setExperience(null);
      setCampaigns([]);
      setError('The experience link is incomplete.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setCampaignError(null);
    try {
      const nextExperience = await getPublishedPlayExperience(slug);
      setExperience(nextExperience);
      if (nextExperience?.engine_key === 'PRIZE_DRAW') {
        await loadCampaigns(nextExperience.id);
      } else {
        setCampaigns([]);
      }
    } catch (reason) {
      setError(playFriendlyError(reason));
    } finally {
      setLoading(false);
    }
  }, [loadCampaigns, slug]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => { active = false; };
  }, [load]);

  const safeHeroUrl = playMediaPublicUrl(experience?.hero_asset_url);

  if (loading) return <PlayExperienceDetailSkeleton />;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to VAD Play"
        onPress={() => router.replace('/play')}
        style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1, paddingVertical: 4 })}
      >
        <VadIcon name="back" size={17} tone="secondary" />
        <VadText variant="caption" tone="secondary">VAD Play</VadText>
      </Pressable>

      <PlayTabNavigation active="Discover" />
      <PlayAdSlot placementCode="play-experience-inline" />

      {error ? (
        <PlayMessageState title="Could not load this game" body="Try again in a moment." actionLabel="Retry" onAction={() => void load()} tone="error" />
      ) : !experience ? (
        <PlayMessageState title="Game unavailable" body="This game is not open yet." actionLabel="Browse experiences" onAction={() => router.replace('/play/games')} />
      ) : (
        <>
          {safeHeroUrl ? (
            <Image
              source={{ uri: safeHeroUrl }}
              accessibilityLabel={experience.image_alt ?? experience.title}
              resizeMode="cover"
              style={{ width: '100%', height: 240, borderRadius: theme.radius.xxl, backgroundColor: theme.colors.surfaceMuted }}
            />
          ) : null}

          <View style={{ gap: theme.spacing.md }}>
            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 7, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandSoft }}>
              <VadText variant="caption" tone="brand">{playExperienceLabel(experience.experience_type)}</VadText>
            </View>
            <VadText variant="title">{experience.title}</VadText>
            {experience.subtitle ? <VadText variant="heading" tone="secondary">{experience.subtitle}</VadText> : null}
            {experience.description ? <VadText>{experience.description}</VadText> : null}
          </View>

          {experience.engine_key === 'PRIZE_DRAW' ? (
            <View style={{ gap: theme.spacing.md }}>
              <View style={{ gap: 4 }}>
                <VadText variant="heading">Prize campaigns</VadText>
                <VadText tone="secondary">Campaign details</VadText>
              </View>
              {campaignError ? (
                <PlayMessageState title="Could not load campaigns" body="Try again in a moment." actionLabel="Refresh campaigns" onAction={() => void loadCampaigns(experience.id)} tone="error" />
              ) : campaigns.length === 0 ? (
                <PlayMessageState
                  title="No campaigns yet"
                  body="Check back soon."
                  actionLabel="Refresh campaigns"
                  onAction={() => void loadCampaigns(experience.id)}
                />
              ) : (
                <View style={{ gap: theme.spacing.md }}>
                  {campaigns.map((campaign) => <PlayCampaignSummary key={campaign.id} campaign={campaign} />)}
                </View>
              )}
            </View>
          ) : experience.public_config?.practice_mode === true && (
            experience.engine_key === 'QUICK_DRAW'
            || experience.engine_key === 'SPIN_AND_WIN'
            || experience.engine_key === 'SCRATCH_AND_REVEAL') ? (
            <PlayPracticeGamePanel experienceId={experience.id} engineKey={experience.engine_key} />
          ) : (
            <View style={{ borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: theme.spacing.lg, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <VadIcon name="info" tone="brand" size={18} />
                <VadText variant="heading">Coming soon</VadText>
              </View>
              <VadText tone="secondary">
                This game is not open to players yet.
              </VadText>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/play/games')}
            style={({ pressed }) => ({ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandPrimary, paddingHorizontal: 18, opacity: pressed ? 0.8 : 1 })}
          >
            <VadText variant="label" tone="inverse">More games</VadText>
          </Pressable>
        </>
      )}
    </View>
  );
}
