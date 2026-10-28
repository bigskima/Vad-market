import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { PlayAdSlot } from './play-ad-slot';
import { getPublishedPlayExperience, playFriendlyError, type PlayExperience, playExperienceLabel } from '@/services/play-api';
import { PlayLoadingState, PlayMessageState } from './play-states';
import { PlayTabNavigation } from './play-tab-navigation';

export function PlayExperienceDetailScreen() {
  const theme = useVadTheme();
  const params = useLocalSearchParams<{ experienceSlug?: string | string[] }>();
  const slug = Array.isArray(params.experienceSlug) ? params.experienceSlug[0] : params.experienceSlug;
  const [experience, setExperience] = useState<PlayExperience | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) {
      await Promise.resolve();
      setExperience(null);
      setError('The experience link is incomplete.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setExperience(await getPublishedPlayExperience(slug));
    } catch (reason) {
      setError(playFriendlyError(reason));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => {
        if (active) {
          setLoading(true);
          setError(null);
        }
        return slug ? getPublishedPlayExperience(slug) : null;
      })
      .then((nextExperience) => {
        if (!active) return;
        setExperience(nextExperience);
        if (!slug) setError('The experience link is incomplete.');
      })
      .catch((reason) => {
        if (active) setError(playFriendlyError(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const safeHeroUrl = experience?.hero_asset_url?.startsWith('https://') ? experience.hero_asset_url : null;

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

      {loading ? (
        <PlayLoadingState label="Loading experience details" />
      ) : error ? (
        <PlayMessageState title="Experience details are unavailable" body={error} actionLabel="Retry" onAction={() => void load()} tone="error" />
      ) : !experience ? (
        <PlayMessageState
          title="This experience is not available"
          body="It may have been unpublished or its link may have changed. The catalogue only opens experiences that are currently published."
          actionLabel="Browse experiences"
          onAction={() => router.replace('/play/games')}
        />
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

          <View style={{ borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: theme.spacing.lg, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <VadIcon name="info" tone="brand" size={18} />
              <VadText variant="heading">Before you play</VadText>
            </View>
            <VadText tone="secondary">
              Catalogue and detail pages are live. Paid entries, game outcomes, and reward payouts only activate after the specific experience engine, server-side controls, and required approvals are connected.
            </VadText>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/play/games')}
            style={({ pressed }) => ({ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandPrimary, paddingHorizontal: 18, opacity: pressed ? 0.8 : 1 })}
          >
            <VadText variant="label" tone="inverse">Explore other experiences</VadText>
          </Pressable>
        </>
      )}
    </View>
  );
}
