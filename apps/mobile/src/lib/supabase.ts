import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

/**
 * Supabase/PostgREST has been observed queuing otherwise-fast SQL calls for
 * several seconds while a burst of requests is in flight. Gate REST requests
 * centrally so screens and hooks share the same budget instead of each
 * implementing an isolated limit. Auth, Storage, Functions and Realtime are
 * intentionally not gated by this queue.
 */
const MAX_PARALLEL_REST_REQUESTS = 4;
let activeRestRequests = 0;

type RestWaiter = {
  resolve: () => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal | null;
  onAbort?: () => void;
};

const restRequestQueue: RestWaiter[] = [];

function releaseRestRequestSlot() {
  const next = restRequestQueue.shift();
  if (next) {
    if (next.signal && next.onAbort) {
      next.signal.removeEventListener('abort', next.onAbort);
    }
    next.resolve();
    return;
  }
  activeRestRequests = Math.max(0, activeRestRequests - 1);
}

function acquireRestRequestSlot(signal?: AbortSignal | null): Promise<() => void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new Error('REST request was aborted'));
  }

  if (activeRestRequests < MAX_PARALLEL_REST_REQUESTS) {
    activeRestRequests += 1;
    return Promise.resolve(releaseRestRequestSlot);
  }

  return new Promise((resolve, reject) => {
    const waiter: RestWaiter = {
      resolve: () => resolve(releaseRestRequestSlot),
      reject,
      signal,
    };
    waiter.onAbort = () => {
      const index = restRequestQueue.indexOf(waiter);
      if (index >= 0) restRequestQueue.splice(index, 1);
      reject(signal?.reason ?? new Error('REST request was aborted'));
    };
    signal?.addEventListener('abort', waiter.onAbort, { once: true });
    restRequestQueue.push(waiter);
  });
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if ('url' in input) return input.url;
  return input.toString();
}

const baseFetch = globalThis.fetch.bind(globalThis);
const concurrencyLimitedFetch: typeof fetch = async (input, init) => {
  const url = getRequestUrl(input);
  if (!url.includes('/rest/v1/')) {
    return baseFetch(input, init);
  }

  const requestSignal = init?.signal
    ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
  const release = await acquireRestRequestSlot(requestSignal);
  try {
    return await baseFetch(input, init);
  } finally {
    release();
  }
};

export const supabaseConfiguration = {
  ready: Boolean(supabaseUrl && supabasePublishableKey),
  missing: [
    !supabaseUrl ? 'EXPO_PUBLIC_SUPABASE_URL' : null,
    !supabasePublishableKey
      ? 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
      : null,
  ].filter((value): value is string => Boolean(value)),
} as const;

// The root layout blocks the authenticated runtime when public deployment
// configuration is absent. Keeping this module non-throwing prevents a
// missing build-time variable from crashing the web bundle before React can
// render a useful deployment error screen.
export const supabase = (
  supabaseConfiguration.ready
    ? createClient(supabaseUrl!, supabasePublishableKey!, {
        auth: {
          storage: globalThis.localStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
        global: {
          fetch: concurrencyLimitedFetch,
        },
      })
    : null
) as SupabaseClient;
