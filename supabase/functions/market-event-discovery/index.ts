import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

type JsonRecord = Record<string, unknown>;
type DiscoverySource = {
  code: string;
  name: string;
  adapterCode: 'GDELT_DOC_V2' | 'RSS_ATOM' | string;
  endpoint: string;
  categoryCodes: string[];
  regionCodes: string[];
  status: 'ACTIVE' | 'DISABLED' | 'DEGRADED' | string;
  priority: number;
  dailyRequestLimit: number;
  cacheSeconds: number;
  config: JsonRecord;
};
type DiscoveryItem = {
  title: string;
  summary: string;
  url: string;
  externalId: string;
  publishedAt: string | null;
  payload: JsonRecord;
};

const json = (body: unknown, status = 200, cacheSeconds = 0) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
    'Cache-Control': cacheSeconds > 0 ? 'private, max-age=' + Math.min(cacheSeconds, 3600) : 'no-store',
  },
});

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeText(value: unknown, max = 500): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function safeNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function runtimeCredentials() {
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))?.trim();
  const service = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))?.trim();
  if (!url || !anon || !service) throw new Error('Event discovery is not configured.');
  return { url, anon, service };
}

async function authenticate(req: Request) {
  const authorization = req.headers.get('authorization') ?? '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error('Please sign in with a market-management account.');
  const { url, anon, service } = runtimeCredentials();
  const user = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await user.auth.getUser(token);
  if (error || !data.user) throw new Error('Your administrator session is invalid or has expired.');

  // This permission-gated call authorizes both scanning and reading candidates.
  const { data: sourcesForAuthorization, error: permissionError } = await user.rpc('admin_event_discovery_sources');
  if (permissionError || !Array.isArray(sourcesForAuthorization)) {
    throw new Error('Market-management permission is required to run event discovery.');
  }
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: categoryRows, error: categoryError } = await user.rpc('get_market_category_experiences');
  if (categoryError || !Array.isArray(categoryRows)) {
    throw new Error('The active VAD category catalogue could not be loaded.');
  }
  const { data: sourceRows, error: sourceError } = await admin.rpc('internal_event_discovery_source_catalog');
  if (sourceError || !Array.isArray(sourceRows)) throw new Error('The event-discovery source registry is unavailable.');
  return { user, admin, categories: categoryRows as JsonRecord[], sources: sourceRows as DiscoverySource[] };
}

async function fetchWithTimeout(url: URL, init: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error('Source returned HTTP ' + response.status + '.');
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('The source response exceeded the 2 MB safety limit.');
    return text;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The source request timed out.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parsePublishedDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function validHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString().slice(0, 1200);
  } catch {
    return null;
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function xmlDecode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_all, n: string) => {
      const code = Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_all, n: string) => {
      const code = Number.parseInt(n, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function xmlTag(block: string, tag: string) {
  const expression = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '\\s*>', 'i');
  return xmlDecode(block.match(expression)?.[1] ?? '');
}

function parseRss(xml: string, query: string): DiscoveryItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)].map((match) => match[0]).slice(0, 100);
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 2).slice(0, 8);
  const items: DiscoveryItem[] = [];
  for (const block of blocks) {
    const title = xmlTag(block, 'title').slice(0, 500);
    const summary = (xmlTag(block, 'description') || xmlTag(block, 'summary') || xmlTag(block, 'content')).slice(0, 2000);
    const atomHref = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i)?.[1];
    const rawUrl = atomHref ? xmlDecode(atomHref) : (xmlTag(block, 'link') || xmlTag(block, 'guid'));
    const url = validHttpsUrl(rawUrl);
    if (!title || title.length < 8 || !url) continue;
    if (terms.length && !terms.some((term) => (title + ' ' + summary).toLowerCase().includes(term))) continue;
    const externalId = (xmlTag(block, 'guid') || url).slice(0, 500);
    items.push({
      title,
      summary,
      url,
      externalId,
      publishedAt: parsePublishedDate(xmlTag(block, 'pubDate') || xmlTag(block, 'published') || xmlTag(block, 'updated') || xmlTag(block, 'date')),
      payload: { adapter: 'RSS_ATOM' },
    });
  }
  return items.slice(0, 50);
}

function assertSafeFeedUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('RSS/Atom sources must use HTTPS without embedded credentials or custom ports.');
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')
    || host === '127.0.0.1' || host === '0.0.0.0' || host === '169.254.169.254'
    || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || !host.includes('.')) {
    throw new Error('The configured feed host is not a public hostname.');
  }
  return url;
}

async function fetchGdelt(source: DiscoverySource, query: string, config: JsonRecord): Promise<DiscoveryItem[]> {
  const endpoint = new URL(source.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'api.gdeltproject.org'
      || endpoint.pathname !== '/api/v2/doc/doc') {
    throw new Error('GDELT must use the approved public document API endpoint.');
  }
  const days = Math.max(1, Math.min(14, Math.floor(safeNumber(config.lookback_days, 7))));
  const start = new Date(Date.now() - days * 86400_000);
  const dateFormat = (date: Date) => date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  endpoint.searchParams.set('query', query);
  endpoint.searchParams.set('mode', 'ArtList');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('sort', 'HybridRel');
  endpoint.searchParams.set('maxrecords', String(Math.max(1, Math.min(50, Math.floor(safeNumber(config.max_records, 50))))));
  endpoint.searchParams.set('startdatetime', dateFormat(start));
  endpoint.searchParams.set('enddatetime', dateFormat(new Date()));
  const text = await fetchWithTimeout(endpoint, { headers: { Accept: 'application/json' } });
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { throw new Error('GDELT returned an invalid JSON response.'); }
  if (!isRecord(payload) || !Array.isArray(payload.articles)) throw new Error('GDELT response did not contain an article list.');
  return payload.articles.slice(0, 50).flatMap((value): DiscoveryItem[] => {
    if (!isRecord(value)) return [];
    const title = safeText(value.title, 500);
    const url = validHttpsUrl(value.url);
    if (title.length < 8 || !url) return [];
    const domain = safeText(value.domain, 180);
    const seen = typeof value.seendate === 'string'
      ? value.seendate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')
      : null;
    return [{
      title,
      summary: [domain, safeText(value.sourcecountry, 80), safeText(value.language, 20)].filter(Boolean).join(' · '),
      url,
      externalId: url,
      publishedAt: parsePublishedDate(seen),
      payload: {
        adapter: 'GDELT_DOC_V2',
        domain,
        language: safeText(value.language, 20),
        sourceCountry: safeText(value.sourcecountry, 20),
        socialImage: validHttpsUrl(value.socialimage),
      },
    }];
  });
}

async function fetchSource(source: DiscoverySource, query: string): Promise<DiscoveryItem[]> {
  const config = isRecord(source.config) ? source.config : {};
  if (source.adapterCode === 'GDELT_DOC_V2') return fetchGdelt(source, query, config);
  if (source.adapterCode === 'RSS_ATOM') {
    const endpoint = assertSafeFeedUrl(source.endpoint);
    const xml = await fetchWithTimeout(endpoint, { headers: { Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9' } });
    return parseRss(xml, query);
  }
  throw new Error('The ' + source.adapterCode + ' adapter is not implemented.');
}

async function handle(req: Request) {
  const { user, admin, categories, sources } = await authenticate(req);
  let body: JsonRecord;
  try {
    const input = await req.json();
    if (!isRecord(input)) return json({ error: 'INVALID_BODY', message: 'Request body must be a JSON object.' }, 400);
    body = input;
  } catch {
    return json({ error: 'INVALID_BODY', message: 'Request body must be valid JSON.' }, 400);
  }

  const categoryCode = safeText(body.categoryCode, 80).toUpperCase();
  const category = categories.find((item) => String(item.code ?? '').toUpperCase() === categoryCode);
  if (!category) return json({ error: 'CATEGORY_REQUIRED', message: 'Choose an active VAD category before discovering events.' }, 400);
  const query = safeText(body.query, 220) || safeText(category.name, 100);
  const regionCode = safeText(body.regionCode, 24).toUpperCase() || 'GLOBAL';
  if (query.length < 3) return json({ error: 'QUERY_TOO_SHORT', message: 'Enter at least three characters to discover relevant events.' }, 400);
  const regionHint: Record<string, string> = {
    NG: 'Nigeria', AFRICA: 'Africa', US: 'United States', EU: 'European Union',
  };
  const sourceQuery = regionCode === 'GLOBAL' ? query : [query, regionHint[regionCode] || regionCode].join(' ');

  const matchingSources = sources
    .filter((source) => ['ACTIVE', 'DEGRADED'].includes(source.status))
    .filter((source) => source.categoryCodes.includes('*') || source.categoryCodes.map((v) => v.toUpperCase()).includes(categoryCode))
    .filter((source) => source.regionCodes.includes('*') || source.regionCodes.map((v) => v.toUpperCase()).includes(regionCode))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5);

  if (!matchingSources.length) {
    return json({ ok: true, query, categoryCode, regionCode, candidates: [], sources: [], message: 'No active discovery source covers this category and region yet. Configure one in Admin.' });
  }

  const sourceResults: { code: string; name: string; status: string; count: number; cached?: boolean; stale?: boolean; message?: string }[] = [];
  const candidatesToStore: JsonRecord[] = [];
  for (const source of matchingSources) {
    const cacheKey = await sha256([source.code, categoryCode, regionCode, sourceQuery.toLowerCase()].join('|'));
    const { data: cached, error: cacheReadError } = await admin.rpc('internal_get_event_discovery_cache', { p_request_key: cacheKey });
    let staleCandidates: DiscoveryItem[] | null = null;
    if (!cacheReadError && isRecord(cached) && isRecord(cached.payload)) {
      const payload = cached.payload;
      const cachedItems = Array.isArray(payload.candidates) ? payload.candidates as DiscoveryItem[] : [];
      const expiresAt = Date.parse(String(cached.expiresAt ?? ''));
      const staleUntil = Date.parse(String(cached.staleUntil ?? ''));
      if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
        sourceResults.push({ code: source.code, name: source.name, status: 'CACHED', count: cachedItems.length, cached: true });
        for (const item of cachedItems) candidatesToStore.push(toStoredCandidate(source, categoryCode, regionCode, sourceQuery, item));
        continue;
      }
      if (Number.isFinite(staleUntil) && staleUntil > Date.now()) staleCandidates = cachedItems;
    }

    const { data: reserved, error: reserveError } = await admin.rpc('internal_reserve_event_discovery_request', {
      p_source_code: source.code,
      p_daily_limit: source.dailyRequestLimit,
    });
    if (reserveError || reserved !== true) {
      if (staleCandidates) {
        sourceResults.push({ code: source.code, name: source.name, status: 'STALE_CACHE', count: staleCandidates.length, cached: true, stale: true });
        for (const item of staleCandidates) candidatesToStore.push(toStoredCandidate(source, categoryCode, regionCode, sourceQuery, item));
      } else {
        sourceResults.push({ code: source.code, name: source.name, status: 'SKIPPED', count: 0, message: 'The configured request budget is unavailable or exhausted.' });
      }
      continue;
    }

    try {
      const items = await fetchSource(source, sourceQuery);
      sourceResults.push({ code: source.code, name: source.name, status: 'SUCCESS', count: items.length });
      for (const item of items) candidatesToStore.push(toStoredCandidate(source, categoryCode, regionCode, sourceQuery, item));
      await admin.rpc('internal_upsert_event_discovery_cache', {
        p_request_key: cacheKey,
        p_source_code: source.code,
        p_payload: { candidates: items },
        p_ttl_seconds: source.cacheSeconds,
        p_stale_seconds: 21600,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Source request failed.';
      sourceResults.push({ code: source.code, name: source.name, status: 'FAILED', count: 0, message });
      if (staleCandidates) {
        sourceResults[sourceResults.length - 1].status = 'STALE_CACHE';
        sourceResults[sourceResults.length - 1].stale = true;
        sourceResults[sourceResults.length - 1].count = staleCandidates.length;
        for (const item of staleCandidates) candidatesToStore.push(toStoredCandidate(source, categoryCode, regionCode, query, item));
      }
    }
  }

  if (candidatesToStore.length) {
    const { error } = await admin.rpc('internal_upsert_discovered_event_candidates', { p_candidates: candidatesToStore.slice(0, 200) });
    if (error) return json({ error: 'CANDIDATE_STORE_FAILED', message: 'The discovered events could not be saved to the review queue.' }, 503);
  }

  const { data: queue, error: queueError } = await user.rpc('admin_list_discovered_event_candidates', {
    p_category_code: categoryCode,
    p_limit: 100,
  });
  if (queueError || !Array.isArray(queue)) return json({ error: 'CANDIDATE_QUEUE_UNAVAILABLE', message: 'Events were fetched, but the review queue could not be refreshed.' }, 503);

  const successCount = sourceResults.filter((source) => ['SUCCESS', 'CACHED', 'STALE_CACHE'].includes(source.status)).length;
  const statusCode = successCount ? 200 : 502;
  return json({
    ok: Boolean(successCount),
    query,
    sourceQuery,
    categoryCode,
    categoryName: String(category.name ?? categoryCode),
    regionCode,
    fetchedAt: new Date().toISOString(),
    sources: sourceResults,
    candidates: queue,
  }, statusCode);
}

function toStoredCandidate(source: DiscoverySource, categoryCode: string, regionCode: string, query: string, item: DiscoveryItem): JsonRecord {
  return {
    source_code: source.code,
    category_code: categoryCode,
    region_code: regionCode,
    title: safeText(item.title, 500),
    summary: safeText(item.summary, 2000),
    source_url: validHttpsUrl(item.url),
    external_id: safeText(item.externalId || item.url, 500),
    source_published_at: item.publishedAt,
    discovery_query: query,
    candidate_payload: {
      ...(isRecord(item.payload) ? item.payload : {}),
      source_name: source.name,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, 405);
  try {
    return await handle(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Event discovery failed.';
    const status = /sign in|session/i.test(message) ? 401 : /permission/i.test(message) ? 403 : 500;
    return json({ error: 'EVENT_DISCOVERY_FAILED', message }, status);
  }
});
