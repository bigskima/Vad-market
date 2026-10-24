import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
  'Content-Type': 'application/json',
};
type Row = { instrument_public_id: string; title: string; category: string | null; media_path: string | null; status: string };
const cache = new Map<string, { expiresAt: number; result: ImageSource | null }>();
type ImageSource = { imageUrl: string; sourceName: string; sourceUrl: string; articleTitle: string };
const stopWords = new Set([
  'will','who','what','when','where','why','how','the','a','an','is','are','be','before','after','by',
  'in','on','at','to','of','for','from','with','and','or','it','this','that','official','new','next',
  'can','could','would','should','does','do','has','have','win','winner','reach','release','launch',
  'happen','market','2026','2025','2027',
]);
function json(body: unknown, status = 200, ttl = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Cache-Control': ttl > 0 ? 'private, max-age=30, s-maxage=' + Math.min(ttl, 900) : 'no-store',
    },
  });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function clean(value: unknown, max = 400): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}
function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || !hostname.includes('.') || url.port) return null;
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
      || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[')) return null;
    return url.toString().slice(0, 1500);
  } catch { return null; }
}
function relevantTerms(title: string) {
  const tokens = title.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !stopWords.has(word));
  return [...new Set(tokens)].slice(0, 5);
}
function categoryTerms(category: string) {
  const key = category.toUpperCase().replace(/[^A-Z]/g, '');
  if (key.includes('POLITIC') || key.includes('WORLD')) return ['politics', 'election', 'government', 'world'];
  if (key.includes('SPORT')) return ['sports', 'football', 'tournament'];
  if (key.includes('MUSIC')) return ['music', 'singer', 'concert'];
  if (key.includes('ENTERTAINMENT')) return ['film', 'entertainment', 'actor'];
  if (key.includes('AI') || key.includes('ARTIFICIALINTELLIGENCE')) return ['artificial intelligence', 'AI model'];
  if (key.includes('BUSINESS') || key.includes('STOCK') || key.includes('ECONOM')) return ['business', 'economy', 'company'];
  if (key.includes('CRYPTO')) return ['cryptocurrency', 'bitcoin', 'blockchain'];
  return [];
}
function queryFor(title: string, category: string) {
  const entities = relevantTerms(title);
  const topics = categoryTerms(category);
  const entityBlock = entities.length ? '(' + entities.map((word) => '"' + word + '"').join(' OR ') + ')' : '';
  const topicBlock = topics.length ? '(' + topics.map((word) => '"' + word + '"').join(' OR ') + ')' : '';
  return [entityBlock, topicBlock, 'sourcelang:english'].filter(Boolean).join(' ');
}
async function fetchArticles(query: string) {
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', query);
  url.searchParams.set('mode', 'ArtList');
  url.searchParams.set('format', 'json');
  url.searchParams.set('maxrecords', '10');
  url.searchParams.set('sort', 'HybridRel');
  url.searchParams.set('timespan', '30days');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Global news image search returned HTTP ' + response.status);
    const raw = await response.text();
    if (raw.length > 1_000_000) throw new Error('Global news image search exceeded the size limit.');
    return JSON.parse(raw) as unknown;
  } finally { clearTimeout(timer); }
}
async function findSourceImage(title: string, category: string): Promise<ImageSource | null> {
  const terms = relevantTerms(title);
  if (terms.length < 1) return null;
  const key = category.toUpperCase() + '|' + terms.join('|');
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  let selected: ImageSource | null = null;
  try {
    const payload = await fetchArticles(queryFor(title, category));
    const articles = isRecord(payload) && Array.isArray(payload.articles) ? payload.articles.filter(isRecord) : [];
    const titleTerms = terms.slice(0, 4);
    for (const article of articles) {
      const articleTitle = clean(article.title);
      const imageUrl = safeUrl(article.socialimage);
      const sourceUrl = safeUrl(article.url);
      if (!articleTitle || !imageUrl || !sourceUrl) continue;
      const lower = articleTitle.toLowerCase();
      const score = titleTerms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
      // Prefer a source image only when its headline relates to this market.
      if (score < Math.min(2, titleTerms.length)) continue;
      const sourceName = clean(article.domain, 180).replace(/^www\./i, '') || new URL(sourceUrl).hostname.replace(/^www\./i, '');
      selected = { imageUrl, sourceName, sourceUrl, articleTitle };
      break;
    }
  } catch {
    // Optional source imagery never blocks a market; AI is the fallback.
  }
  cache.set(key, { expiresAt: Date.now() + 15 * 60_000, result: selected });
  while (cache.size > 400) cache.delete(cache.keys().next().value!);
  return selected;
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))?.trim();
    const bearer = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1];
    if (!supabaseUrl || !serviceKey || !anonKey || !bearer) return json({ error: 'Authentication required' }, 401);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const serviceCall = bearer === serviceKey;
    if (!serviceCall) {
      const { data, error } = await admin.auth.getUser(bearer);
      if (error || !data.user) return json({ error: 'Authentication required' }, 401);
    }
    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!isRecord(parsed)) return json({ error: 'Invalid request body' }, 400);
      body = parsed;
    } catch { return json({ error: 'Invalid JSON' }, 400); }
    const instrumentId = clean(body.instrumentId, 80);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(instrumentId)) {
      return json({ error: 'A valid instrument ID is required.' }, 400);
    }
    const { data, error } = await admin.from('market_catalog')
      .select('instrument_public_id,title,category,media_path,status')
      .eq('instrument_public_id', instrumentId).maybeSingle();
    if (error) return json({ error: 'The market catalogue could not be read.' }, 500);
    if (!data) return json({ error: 'Market not found.' }, 404);
    const market = data as Row;
    const currentMediaPath = market.media_path?.trim() || null;
    if (currentMediaPath) {
      // A manually uploaded/admin-selected image remains authoritative. Only
      // allow a publisher image to supersede artwork proven to be generated by
      // VAD's existing image worker for this exact instrument.
      const { data: imageJob, error: imageJobError } = await admin
        .from('market_image_generation_jobs')
        .select('generated_media_path')
        .eq('instrument_public_id', instrumentId)
        .maybeSingle();
      const jobPath = !imageJobError && typeof imageJob?.generated_media_path === 'string'
        ? imageJob.generated_media_path.trim()
        : '';
      if (!jobPath || jobPath !== currentMediaPath) {
        return json({ ok: true, hasExistingMedia: true, mediaPath: currentMediaPath, source: 'existing' });
      }
      if (String(market.status).toUpperCase() === 'DRAFT') {
        return json({ ok: true, hasExistingMedia: true, mediaPath: currentMediaPath, source: 'ai-existing' });
      }
      const result = await findSourceImage(clean(market.title, 400), clean(market.category, 80) || 'general');
      if (result) return json({ ok: true, ...result, source: 'publisher', replacedGeneratedMedia: true }, 200, 180);
      return json({ ok: true, hasExistingMedia: true, mediaPath: currentMediaPath, source: 'ai-existing', reason: 'NO_RELEVANT_SOURCE_IMAGE' });
    }
    if (String(market.status).toUpperCase() === 'DRAFT') return json({ ok: true, imageUrl: null, reason: 'DRAFT' });
    const result = await findSourceImage(clean(market.title, 400), clean(market.category, 80) || 'general');
    return json({ ok: true, ...(result ?? { imageUrl: null }), ...(result ? { source: 'publisher' } : { reason: 'NO_RELEVANT_SOURCE_IMAGE' }) }, 200, 180);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Source image discovery is temporarily unavailable.' }, 502);
  }
});
