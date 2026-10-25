import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { ProductRoute } from '@/features/navigation/product-route';
import { PageHeader } from '@/features/navigation/page-header';
import { TourTarget } from '@/features/tour/tour-provider';
import { getNewsFeed, type NewsCategory, type NewsStory } from '@/services/news-api';

const categories: { value: NewsCategory; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'POLITICS', label: 'Politics' },
  { value: 'WORLD', label: 'World' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'ECONOMY', label: 'Economy' },
  { value: 'TECHNOLOGY', label: 'Technology' },
  { value: 'AI', label: 'AI' },
  { value: 'SCIENCE', label: 'Science' },
  { value: 'HEALTH', label: 'Health' },
  { value: 'SPORTS', label: 'Sports' },
  { value: 'MUSIC', label: 'Music' },
  { value: 'ENTERTAINMENT', label: 'Entertainment' },
];

export default function NewsRoute() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState<NewsCategory>('ALL');
  const [stories, setStories] = useState<NewsStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const columns = width >= 760 ? 2 : 1;

  useEffect(() => {
    let active = true;
    const start = setTimeout(() => {
      setLoading(true);
      setError(null);
      void getNewsFeed({ category, limit: 30 })
        .then((page) => {
          if (!active) return;
          setStories(page.stories);
          setError(null);
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : 'News is temporarily unavailable.');
        })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; clearTimeout(start); };
  }, [category]);

  function openStory(story: NewsStory) {
    router.push({
      pathname: '/news/[storyId]',
      params: {
        storyId: story.id,
        title: story.title,
        url: story.url,
        imageUrl: story.imageUrl ?? '',
        source: story.source,
        sourceCountry: story.sourceCountry ?? '',
        language: story.language ?? '',
        publishedAt: story.publishedAt ?? '',
        seenAt: story.seenAt ?? '',
        category: story.category,
        summary: story.summary ?? '',
        author: story.author ?? '',
        section: story.section ?? '',
        tags: JSON.stringify(story.tags ?? []),
      },
    });
  }

  return (
    <ProductRoute active="Markets" hideTopBar>
      <View style={{ gap: density.phone ? theme.spacing.md : theme.spacing.lg }}>
        <PageHeader
          title="News & headlines"
          actions={[
            { icon: 'back', label: 'Back to Markets', onPress: () => router.replace('/markets') },
          ]}
        />

        <TourTarget id="news-feed">
        <VadText variant="bodyStrong" style={{ fontSize: 17 }}>Top stories</VadText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingRight: 8 }}>
          {categories.map((item) => {
            const selected = item.value === category;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setCategory(item.value)}
                style={({ pressed }) => ({
                  borderRadius: 22,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                  opacity: pressed ? 0.76 : 1,
                })}
              >
                <VadText variant="label" tone={selected ? 'brand' : 'secondary'}>{item.label}</VadText>
              </Pressable>
            );
          })}
        </ScrollView>
        </TourTarget>

        {loading ? (
          <View style={{ gap: theme.spacing.md }}>
            {[0, 1, 2].map((item) => <VadSkeleton key={item} height={208} radius={theme.radius.lg} />)}
          </View>
        ) : error && !stories.length ? (
          <VadErrorState title="News unavailable" message={error} onRetry={() => {
            setLoading(true);
            void getNewsFeed({ category, limit: 30 })
              .then((page) => {
                setStories(page.stories);
                setError(null);
              })
              .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Please try again.'))
              .finally(() => setLoading(false));
          }} />
        ) : stories.length ? (
          <View style={{ flexDirection: columns === 2 ? 'row' : 'column', flexWrap: columns === 2 ? 'wrap' : 'nowrap', gap: theme.spacing.md }}>
            {stories.map((story) => (
              <View key={story.id} style={{ width: columns === 2 ? '48.8%' : '100%', flexGrow: columns === 2 ? 1 : 0, minWidth: 0 }}>
                <NewsStoryCard story={story} onPress={() => openStory(story)} />
              </View>
            ))}
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
            <VadIcon name="fileText" size={28} tone="tertiary" />
            <VadText variant="bodyStrong">No stories yet</VadText>
          </View>
        )}

        {error && stories.length ? <VadText variant="caption" tone="warning">{error}</VadText> : null}
      </View>
    </ProductRoute>
  );
}

function NewsStoryCard({ story, onPress }: { story: NewsStory; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [imageFailed, setImageFailed] = useState(false);
  const dateLabel = story.publishedAt ? new Date(story.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Latest';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Read story: ' + story.title}
      onPress={onPress}
      style={({ pressed }) => ({
        overflow: 'hidden',
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.84 : 1,
      })}
    >
      <View style={{ height: density.phone ? 156 : 176, overflow: 'hidden', backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
        {story.imageUrl && !imageFailed ? (
          <Image
            source={{ uri: story.imageUrl }}
            resizeMode="cover"
            accessibilityLabel={story.title + ' cover image'}
            onError={() => setImageFailed(true)}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 }}>
            <VadIcon name="fileText" size={34} tone="brand" />
            <VadText variant="caption" tone="secondary">{story.category.replace(/_/g, ' ')}</VadText>
          </View>
        )}
      </View>
      <View style={{ padding: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: theme.colors.brandSoft }}>
            <VadText variant="caption" tone="brand">{story.category.replace(/_/g, ' ')}</VadText>
          </View>
          <VadText variant="caption" tone="tertiary" numberOfLines={1}>{dateLabel}</VadText>
        </View>
        <VadText variant="bodyStrong" style={{ fontSize: 16, lineHeight: 22 }} numberOfLines={4}>{story.title}</VadText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <VadIcon name="globe" size={14} tone="tertiary" />
          <VadText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>{story.source}{story.sourceCountry ? ' · ' + story.sourceCountry : ''}</VadText>
          <VadIcon name="chevronRight" size={16} tone="brand" />
        </View>
      </View>
    </Pressable>
  );
}
