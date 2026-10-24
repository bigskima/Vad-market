import { supabase } from '@/lib/supabase';

export type NewsCategory =
  | 'ALL'
  | 'POLITICS'
  | 'WORLD'
  | 'BUSINESS'
  | 'ECONOMY'
  | 'TECHNOLOGY'
  | 'AI'
  | 'SCIENCE'
  | 'HEALTH'
  | 'SPORTS'
  | 'MUSIC'
  | 'ENTERTAINMENT';

export type NewsStory = {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
  source: string;
  sourceCountry: string | null;
  language: string | null;
  publishedAt: string | null;
  seenAt: string | null;
  category: NewsCategory;
  summary: string | null;
  author: string | null;
  section: string | null;
  tags: string[];
};

export type NewsFeedPage = {
  source: string;
  fetchedAt: string;
  category: NewsCategory;
  query: string;
  stories: NewsStory[];
  notice?: string | null;
  cached?: boolean;
};

export type NewsArticleDetails = Pick<
  NewsStory,
  'title' | 'url' | 'imageUrl' | 'source' | 'publishedAt' | 'summary' | 'author' | 'section' | 'tags'
> & {
  language: string | null;
  sourceCountry: string | null;
  canonicalUrl: string;
  publisherDetailsAvailable: boolean;
};

function failure(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) throw error;
  throw new Error(fallback);
}

export async function getNewsFeed(input: {
  category?: NewsCategory;
  query?: string;
  limit?: number;
} = {}): Promise<NewsFeedPage> {
  const { data, error } = await supabase.functions.invoke('news-feed', {
    body: {
      action: 'list',
      category: input.category ?? 'ALL',
      query: (input.query ?? '').trim().slice(0, 100),
      limit: Math.max(10, Math.min(40, Math.floor(input.limit ?? 24))),
    },
  });
  if (error) failure(error, 'News is temporarily unavailable.');
  if (!data || !Array.isArray(data.stories)) {
    throw new Error('The news provider returned an invalid response.');
  }
  return data as NewsFeedPage;
}

export async function getNewsArticleDetails(input: {
  url: string;
  fallback: Partial<NewsStory>;
}): Promise<NewsArticleDetails> {
  const fallback = input.fallback;
  const { data, error } = await supabase.functions.invoke('news-feed', {
    body: { action: 'details', url: input.url },
  });
  if (error) {
    return {
      title: fallback.title ?? 'News article',
      url: input.url,
      imageUrl: fallback.imageUrl ?? null,
      source: fallback.source ?? 'Original publisher',
      publishedAt: fallback.publishedAt ?? null,
      summary: fallback.summary ?? null,
      author: fallback.author ?? null,
      section: fallback.section ?? null,
      tags: fallback.tags ?? [],
      language: fallback.language ?? null,
      sourceCountry: fallback.sourceCountry ?? null,
      canonicalUrl: input.url,
      publisherDetailsAvailable: false,
    };
  }
  return {
    title: data?.title || fallback.title || 'News article',
    url: input.url,
    imageUrl: data?.imageUrl || fallback.imageUrl || null,
    source: data?.source || fallback.source || 'Original publisher',
    publishedAt: data?.publishedAt || fallback.publishedAt || null,
    summary: data?.summary || fallback.summary || null,
    author: data?.author || fallback.author || null,
    section: data?.section || fallback.section || null,
    tags: Array.isArray(data?.tags) ? data.tags : fallback.tags ?? [],
    language: fallback.language ?? null,
    sourceCountry: fallback.sourceCountry ?? null,
    canonicalUrl: data?.canonicalUrl || input.url,
    publisherDetailsAvailable: data?.publisherDetailsAvailable === true,
  };
}
