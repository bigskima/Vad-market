import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { VadCard } from '@/components/ui/vad-card';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { ProductRoute } from '@/features/navigation/product-route';
import { getNewsArticleDetails, type NewsCategory, type NewsStory } from '@/services/news-api';

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function safeTags(value: string) {
  try {
    const decoded = JSON.parse(value) as unknown;
    return Array.isArray(decoded) ? decoded.filter((tag): tag is string => typeof tag === 'string').slice(0, 10) : [];
  } catch {
    return [];
  }
}

export default function NewsStoryRoute() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const params = useLocalSearchParams<{
    storyId?: string | string[];
    title?: string | string[];
    url?: string | string[];
    imageUrl?: string | string[];
    source?: string | string[];
    sourceCountry?: string | string[];
    language?: string | string[];
    publishedAt?: string | string[];
    seenAt?: string | string[];
    category?: string | string[];
    summary?: string | string[];
    author?: string | string[];
    section?: string | string[];
    tags?: string | string[];
  }>();
  const storyId = valueOf(params.storyId);
  const title = valueOf(params.title) || 'News story';
  const url = valueOf(params.url);
  const fallback: Partial<NewsStory> = {
    id: storyId,
    title,
    url,
    imageUrl: valueOf(params.imageUrl) || null,
    source: valueOf(params.source) || 'Original publisher',
    sourceCountry: valueOf(params.sourceCountry) || null,
    language: valueOf(params.language) || null,
    publishedAt: valueOf(params.publishedAt) || null,
    seenAt: valueOf(params.seenAt) || null,
    category: (valueOf(params.category).toUpperCase() || 'WORLD') as NewsCategory,
    summary: valueOf(params.summary) || null,
    author: valueOf(params.author) || null,
    section: valueOf(params.section) || null,
    tags: safeTags(valueOf(params.tags)),
  };
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getNewsArticleDetails>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [openError, setOpenError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!url) {
      const start = setTimeout(() => {
        setDetails(null);
        setLoading(false);
      }, 0);
      return () => clearTimeout(start);
    }
    let active = true;
    const start = setTimeout(() => {
      setLoading(true);
      void getNewsArticleDetails({ url, fallback })
        .then((result) => { if (active) setDetails(result); })
        .catch((reason: unknown) => {
          if (active) {
            setDetails(null);
            setOpenError(reason instanceof Error ? reason.message : 'Publisher details could not be loaded.');
          }
        })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; clearTimeout(start); };
  // The URL and article identity uniquely describe this request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, storyId]);

  const openPublisher = async () => {
    const target = details?.canonicalUrl || url;
    if (!/^https:\/\//i.test(target)) {
      setOpenError('This story does not have a valid publisher link.');
      return;
    }
    try {
      await Linking.openURL(target);
    } catch {
      setOpenError('The publisher link could not be opened on this device.');
    }
  };

  const displayTitle = details?.title || fallback.title || 'News story';
  const displayImage = imageFailed ? null : details?.imageUrl || fallback.imageUrl || null;
  const publishDate = details?.publishedAt || fallback.publishedAt;
  const indexedDate = valueOf(params.seenAt);
  const categoryLabel = (valueOf(params.category) || 'WORLD').replace(/_/g, ' ');

  return (
    <ProductRoute active="Markets" hideTopBar>
      <View style={{ gap: density.phone ? theme.spacing.md : theme.spacing.lg }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to News"
          onPress={() => router.replace('/news')}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 6, opacity: pressed ? 0.7 : 1 })}
        >
          <VadIcon name="back" size={18} tone="secondary" />
          <VadText variant="label" tone="secondary">Back to News</VadText>
        </Pressable>

        {displayImage ? (
          <View style={{ overflow: 'hidden', borderRadius: theme.radius.xl, height: density.phone ? 220 : 320, backgroundColor: theme.colors.surfaceRaised }}>
            <Image
              source={{ uri: displayImage }}
              accessibilityLabel={displayTitle + ' cover image'}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
              style={{ width: '100%', height: '100%' }}
            />
          </View>
        ) : (
          <View style={{ height: density.phone ? 160 : 220, borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <VadIcon name="fileText" size={42} tone="brand" />
            <VadText variant="caption" tone="secondary">{categoryLabel}</VadText>
          </View>
        )}

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
            <View style={{ borderRadius: 13, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: theme.colors.brandSoft }}>
              <VadText variant="caption" tone="brand">{(details?.section || categoryLabel).toUpperCase()}</VadText>
            </View>
            {details?.publisherDetailsAvailable ? (
              <View style={{ borderRadius: 13, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: theme.colors.surfaceRaised }}>
                <VadText variant="caption" tone="secondary">Publisher metadata</VadText>
              </View>
            ) : null}
          </View>
          <VadText variant="title" style={{ fontSize: density.phone ? 26 : 34, lineHeight: density.phone ? 33 : 42 }}>{displayTitle}</VadText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <VadIcon name="globe" size={16} tone="secondary" />
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="bodyStrong">{details?.source || fallback.source}</VadText>
              <VadText variant="caption" tone="secondary">
                {publishDate
                  ? 'Published ' + new Date(publishDate).toLocaleString()
                  : indexedDate ? 'Indexed ' + new Date(indexedDate).toLocaleString() : 'Publication time not provided by source'}
              </VadText>
            </View>
          </View>
        </View>

        {loading ? (
          <VadCard variant="muted" style={{ gap: 10 }}>
            <VadSkeleton width="34%" height={16} />
            <VadSkeleton height={14} />
            <VadSkeleton height={14} />
            <VadSkeleton width="75%" height={14} />
          </VadCard>
        ) : null}

        {details?.summary ? (
          <VadCard variant="raised" style={{ gap: 8 }}>
            <VadText variant="bodyStrong" style={{ fontSize: 17 }}>Story overview</VadText>
            <VadText variant="body" style={{ lineHeight: 24 }}>{details.summary}</VadText>
          </VadCard>
        ) : !loading ? (
          <VadCard variant="muted" style={{ gap: 7 }}>
            <VadText variant="bodyStrong">Publisher summary unavailable</VadText>
            <VadText variant="body" tone="secondary">
              This publisher does not expose a readable summary in its public page metadata. The headline and indexed cover image came from the global news index; use the publisher link below for the complete report.
            </VadText>
          </VadCard>
        ) : null}

        <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
          <VadText variant="bodyStrong" style={{ fontSize: 17 }}>Article details</VadText>
          <DetailRow label="Publisher" value={details?.source || fallback.source || 'Not listed'} />
          <DetailRow label="Author" value={details?.author || fallback.author || 'Not provided'} />
          <DetailRow label="Section" value={details?.section || fallback.section || categoryLabel} />
          <DetailRow label="Published" value={publishDate ? new Date(publishDate).toLocaleString() : 'Publisher timestamp unavailable'} />
          <DetailRow label="Language" value={details?.language || fallback.language || 'Not indexed'} />
          <DetailRow label="Publisher country" value={details?.sourceCountry || fallback.sourceCountry || 'Not indexed'} />
          {details?.tags?.length ? (
            <View style={{ gap: 6 }}>
              <VadText variant="caption" tone="secondary">Publisher keywords</VadText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {details.tags.slice(0, 10).map((tag) => (
                  <View key={tag} style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border }}>
                    <VadText variant="caption" tone="secondary">{tag}</VadText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </VadCard>

        <VadCard variant="muted" style={{ gap: 7 }}>
          <VadText variant="bodyStrong">Read the original report</VadText>
          <VadText variant="body" tone="secondary">
            VAD shows the publisher-provided headline, cover image and available page metadata. The complete article remains with its publisher.
          </VadText>
          <Pressable
            accessibilityRole="link"
            onPress={() => void openPublisher()}
            style={({ pressed }) => ({ minHeight: 48, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.brandPrimary, opacity: pressed ? 0.82 : 1 })}
          >
            <VadText variant="bodyStrong" style={{ color: theme.colors.textInverse }}>Open original article</VadText>
            <VadIcon name="share" size={17} color={theme.colors.textInverse} />
          </Pressable>
        </VadCard>

        {openError ? <VadErrorState title="Could not open story" message={openError} /> : null}
      </View>
    </ProductRoute>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone="secondary" style={{ width: 94 }}>{label}</VadText>
      <VadText variant="caption" style={{ flex: 1, textAlign: 'right' }}>{value}</VadText>
    </View>
  );
}
