import { supabase } from '@/lib/supabase';

type QueuedRequest = {
  instrumentPublicId: string;
  resolve: (path: string | null) => void;
};

const requests = new Map<string, Promise<string | null>>();
const queue: QueuedRequest[] = [];
let activeRequests = 0;
const MAX_CONCURRENT_GENERATIONS = 2;

/**
 * Request server-side AI artwork only for markets that have no image.
 * A shared queue limits burst traffic when the full catalogue is opened; the
 * Edge Function performs the final idempotency and authorization checks.
 */
export function requestMarketImageGeneration(instrumentPublicId: string): Promise<string | null> {
  const id = instrumentPublicId.trim();
  if (!id) return Promise.resolve(null);

  const existing = requests.get(id);
  if (existing) return existing;

  const promise = new Promise<string | null>((resolve) => {
    queue.push({ instrumentPublicId: id, resolve });
    drainQueue();
  });
  requests.set(id, promise);
  return promise;
}

function drainQueue() {
  while (activeRequests < MAX_CONCURRENT_GENERATIONS && queue.length > 0) {
    const next = queue.shift();
    if (!next) return;
    activeRequests += 1;

    void supabase.functions.invoke('market-image-runtime', {
      body: { instrumentId: next.instrumentPublicId },
    }).then(({ data, error }) => {
      const path = !error && data?.ok === true && typeof data.mediaPath === 'string'
        ? data.mediaPath
        : null;
      if (!path) requests.delete(next.instrumentPublicId);
      next.resolve(path);
    }).catch(() => {
      requests.delete(next.instrumentPublicId);
      next.resolve(null);
    }).finally(() => {
      activeRequests = Math.max(0, activeRequests - 1);
      drainQueue();
    });
  }
}
