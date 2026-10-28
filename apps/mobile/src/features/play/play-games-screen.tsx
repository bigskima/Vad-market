import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { PlayAdSlot } from './play-ad-slot';
import { listPublishedPlayExperiences, playFriendlyError, type PlayExperience, playExperienceLabel } from '@/services/play-api';
import { PlayExperienceTile } from './play-experience-tile';
import { PlayMessageState } from './play-states';
import { PlayGamesSkeleton } from '@/components/ui/screen-skeletons';
import { PlayTabNavigation } from './play-tab-navigation';

export function PlayGamesScreen() {
  const theme = useVadTheme();
  const params = useLocalSearchParams<{ type?: string | string[] }>();
  const routeType = Array.isArray(params.type) ? params.type[0] : params.type;
  const activeType = routeType ?? 'ALL';
  const [experiences, setExperiences] = useState<PlayExperience[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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

  const types = useMemo(() => [...new Set(experiences.map((item) => item.experience_type))], [experiences]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return experiences.filter((item) => {
      const matchesType = activeType === 'ALL' || item.experience_type === activeType;
      const matchesQuery = !needle || [item.title, item.subtitle ?? '', item.description ?? '', item.experience_type]
        .join(' ')
        .toLowerCase()
        .includes(needle);
      return matchesType && matchesQuery;
    });
  }, [activeType, experiences, query]);

  if (loading) return <PlayGamesSkeleton />;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: 5 }}>
        <VadText variant="caption" tone="brand" style={{ letterSpacing: 1.4 }}>VAD PLAY</VadText>
        <VadText variant="title">Games</VadText>
        <VadText tone="secondary">Find an experience.</VadText>
      </View>

      <PlayTabNavigation active="Games" />

      <PlayAdSlot placementCode="play-games-inline" />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, paddingHorizontal: theme.spacing.md, minHeight: 48 }}>
        <VadIcon name="search" size={18} tone="tertiary" />
        <TextInput
          accessibilityLabel="Search Play experiences"
          value={query}
          onChangeText={setQuery}
          placeholder="Search games and experiences"
          placeholderTextColor={theme.colors.textTertiary}
          autoCapitalize="none"
          returnKeyType="search"
          style={{ flex: 1, minWidth: 0, color: theme.colors.textPrimary, fontSize: 14, paddingVertical: 10 }}
        />
        {query.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={8}>
            <VadIcon name="close" size={16} tone="tertiary" />
          </Pressable>
        ) : null}
      </View>

      {types.length > 0 ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {['ALL', ...types].map((type) => {
              const selected = activeType === type;
              return (
                <Pressable
                  key={type}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => router.setParams({ type })}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                    backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                    opacity: pressed ? 0.78 : 1,
                  })}
                >
                  <VadText variant="caption" tone={selected ? 'brand' : 'secondary'} style={{ fontWeight: selected ? '800' : '600' }}>
                    {type === 'ALL' ? 'All types' : playExperienceLabel(type)}
                  </VadText>
                </Pressable>
              );
            })}
          </View>
          <VadText variant="caption" tone="tertiary">
            {filtered.length} {filtered.length === 1 ? 'experience' : 'experiences'}
          </VadText>
        </View>
      ) : null}

      {error ? (
        <PlayMessageState title="Games could not be loaded" body={error} actionLabel="Retry" onAction={refresh} tone="error" />
      ) : filtered.length === 0 ? (
        <PlayMessageState
          title={experiences.length === 0 ? 'The games catalogue is empty' : 'No matches found'}
          body={experiences.length === 0
            ? 'New published games will appear here.'
            : 'Try another search or type.'}
          actionLabel={experiences.length === 0 ? 'Back to Discover' : 'Clear filters'}
          onAction={() => {
            if (experiences.length === 0) router.replace('/play');
            else { setQuery(''); router.setParams({ type: 'ALL' }); }
          }}
        />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, justifyContent: 'space-between' }}>
          {filtered.map((experience) => (
            <PlayExperienceTile
              key={experience.id}
              experience={experience}
              onPress={() => router.push({ pathname: '/play/[experienceSlug]', params: { experienceSlug: experience.slug } })}
            />
          ))}
        </View>
      )}
    </View>
  );
}
