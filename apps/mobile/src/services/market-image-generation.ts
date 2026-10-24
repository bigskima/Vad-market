import { supabase } from '@/lib/supabase';

export type MarketImageResult = {
  mediaUrl: string;
  source: 'publisher' | 'ai' | 'existing';
  sourceName?: string;
  sourceUrl?: string;
  articleTitle?: string;
};

type QueuedRequest = {
  instrumentPublicId: string;
  resolve: (result: MarketImageResult | null) => void;
};
const requests = new Map<string, Promise<MarketImageResult | null>>();
const queue: QueuedRequest[] = [];
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 2;

/**
 * Prefer a relevant publisher image for a published real-world event.
 * AI artwork is requested only if the public news index cannot supply a
 * relevant HTTPS image. Existing/manual cover media always wins.
 */
export function requestMarketImageGeneration(instrumentPublicId: string): Promise<MarketImageResult | null> {
  const id = instrumentPublicId.trim();
  if (!id) return Promise.resolve(null);

  const existing = requests.get(id);
  if (existing) return existing;

  const promise = new Promise<MarketImageResult | null>((resolve) => {
    queue.push({ instrumentPublicId: id, resolve });
    drainQueue();
  });
  requests.set(id, promise);
  return promise;
}

function drainQueue() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && queue.length > 0) {
    const next = queue.shift();
    if (!next) return;
    activeRequests += 1;
    void findPublisherImage(next.instrumentPublicId)
      .then((sourceImage) => sourceImage ?? generateAiImage(next.instrumentPublicId))
      .then((result) => {
        if (!result) requests.delete(next.instrumentPublicId);
        next.resolve(result);
      })
      .catch(() => {
        requests.delete(next.instrumentPublicId);
        next.resolve(null);
      })
      .finally(() => {
        activeRequests = Math.max(0, activeRequests - 1);
        drainQueue();
      });
  }
}

async function findPublisherImage(instrumentPublicId: string): Promise<MarketImageResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('market-source-image', {
      body: { instrumentId: instrumentPublicId },
    });
    if (error || data?.ok !== true) return null;
    const existingPath = typeof data.mediaPath === 'string' ? data.mediaPath.trim() : '';
    if (data.hasExistingMedia === true && existingPath) {
      return {
        mediaUrl: existingPath,
        source: data.source === 'existing' ? 'existing' : 'ai',
      };
    }
    const imageUrl = typeof data.imageUrl === 'string' ? data.imageUrl.trim() : '';
    if (!/^https:\/\//i.test(imageUrl)) return null;
    return {
      mediaUrl: imageUrl,
      source: 'publisher',
      sourceName: typeof data.sourceName === 'string' ? data.sourceName : undefined,
      sourceUrl: typeof data.sourceUrl === 'string' ? data.sourceUrl : undefined,
      articleTitle: typeof data.articleTitle === 'string' ? data.articleTitle : undefined,
    };
  } catch {
    return null;
  }
}

async function generateAiImage(instrumentPublicId: string): Promise<MarketImageResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('market-image-runtime', {
      body: { instrumentId: instrumentPublicId },
    });
    const mediaPath = !error && data?.ok === true && typeof data.mediaPath === 'string'
      ? data.mediaPath.trim()
      : '';
    return mediaPath ? { mediaUrl: mediaPath, source: 'ai' } : null;
  } catch {
    return null;
  }
}
