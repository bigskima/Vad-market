import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ImageBackground, Pressable, ScrollView, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { listPublishedPlayExperiences, playFriendlyError, type PlayExperience, playExperienceLabel } from '@/services/play-api';
import { PlayExperienceTile } from './play-experience-tile';
import { PlayLoadingState, PlayMessageState } from './play-states';
import { PlayTabNavigation } from './play-tab-navigation';

const playHeroArt = require('../../../assets/images/vad-welcome-world.jpg');

export function PlayHubScreen() {
  const theme = useVadTheme();
  const [experiences, setExperiences] = useState<PlayExperience[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setExperiences(await listPublishedPlayExperiences());
    } catch (reason) {
      setError(playFriendlyError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => listPublishedPlayExperiences())
      .then((data) => {
        if (active) setExperiences(data);
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
  }, []);

  const categories = [...new Set(experiences.map((item) => item.experience_type))];

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <VadText variant="caption" tone="brand" style={{ letterSpacing: 1.6 }}>VAD PLAY</VadText>
          <VadText variant="title">Make room for play.</VadText>
          <VadText tone="secondary">Games, challenges and prize experiences in one hub.</VadText>
        </View>
      </View>

      <PlayTabNavigation active="Discover" />

      <ImageBackground
        source={playHeroArt}
        resizeMode="cover"
        imageStyle={{ borderRadius: theme.radius.xxl }}
        style={{ minHeight: 210, borderRadius: theme.radius.xxl, overflow: 'hidden', backgroundColor: theme.colors.surfaceRaised }}
      >
        <View style={{ flex: 1, minHeight: 210, justifyContent: 'flex-end', padding: theme.spacing.xl, backgroundColor: 'rgba(10, 12, 27, 0.56)', gap: 9 }}>
          <View style={{ alignSelf: 'flex-start', borderRadius: theme.radius.pill, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 6 }}>
            <VadText variant="caption" tone="inverse" style={{ letterSpacing: 1 }}>DISCOVER SOMETHING NEW</VadText>
          </View>
          <VadText variant="title" tone="inverse" style={{ fontSize: 29, lineHeight: 34, maxWidth: 390 }}>
            One destination. Different ways to play.
          </VadText>
          <VadText tone="inverse" style={{ opacity: 0.86, maxWidth: 440 }}>
            Explore the experiences VAD has actually published. No sample games or made-up campaigns.
          </VadText>
        </View>
      </ImageBackground>

      {categories.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <VadText variant="heading">Explore by type</VadText>
            <Pressable accessibilityRole="button" onPress={() => router.push('/play/games')}>
              <VadText variant="caption" tone="brand">All games</VadText>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
            {categories.map((category) => (
              <Pressable
                key={category}
                accessibilityRole="button"
                accessibilityLabel={'Explore ' + playExperienceLabel(category)}
                onPress={() => router.push('/play/games')}
                style={({ pressed }) => ({
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: pressed ? theme.colors.brandSoft : theme.colors.surface,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  opacity: pressed ? 0.78 : 1,
                })}
              >
                <VadText variant="caption" tone="secondary">{playExperienceLabel(category)}</VadText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <VadText variant="heading">Available experiences</VadText>
            <VadText variant="caption" tone="secondary">Published by VAD Play</VadText>
          </View>
          {experiences.length > 0 ? (
            <VadText variant="caption" tone="tertiary">{experiences.length} live</VadText>
          ) : null}
        </View>

        {loading ? (
          <PlayLoadingState label="Loading the live catalogue" />
        ) : error ? (
          <PlayMessageState title="The catalogue is unavailable" body={error} actionLabel="Try again" onAction={refresh} tone="error" />
        ) : experiences.length === 0 ? (
          <PlayMessageState
            title="No experiences are live yet"
            body="VAD Play will show real, published experiences here. The catalogue is database-driven, so unpublished drafts and demo campaigns are not shown."
            actionLabel="Browse games"
            onAction={() => router.push('/play/games')}
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.md, paddingRight: 4 }}>
            {experiences.slice(0, 8).map((experience) => (
              <PlayExperienceTile
                key={experience.id}
                experience={experience}
                compact
                onPress={() => router.push({ pathname: '/play/[experienceSlug]', params: { experienceSlug: experience.slug } })}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.lg }}>
        <View style={{ flex: 1, gap: 4 }}>
          <VadText variant="heading">Your Play history</VadText>
          <VadText variant="caption" tone="secondary">Keep track of your own confirmed activity in one place.</VadText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open My Play"
          onPress={() => router.push('/play/activity')}
          style={({ pressed }) => ({ borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 11, borderRadius: theme.radius.pill, opacity: pressed ? 0.75 : 1 })}
        >
          <VadText variant="caption" tone="brand">My Play</VadText>
        </Pressable>
      </View>
    </View>
  );
}
