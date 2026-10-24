const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
  'Content-Type': 'application/json',
};

type RecordValue = Record<string, unknown>;
type Category = 'ALL' | 'POLITICS' | 'WORLD' | 'BUSINESS' | 'ECONOMY' | 'TECHNOLOGY' | 'AI' | 'SCIENCE' | 'HEALTH' | 'SPORTS' | 'MUSIC' | 'ENTERTAINMENT';
type Story = {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
  source: string;
  sourceCountry: string | null;
  language: string | null;
  publishedAt: string | null;
  seenAt: string | null;
  category: Category;
  summary: string | null;
  author: string | null;
  section: string | null;
  tags: string[];
};
const CACHE = new Map<string, { expiresAt: number; payload: RecordValue }>();
const TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 60;
const CATEGORY_QUERY: Record<Category, string> = {
  ALL: '(politics OR election OR government OR world OR economy OR business OR technology OR science OR health OR sports OR music OR entertainment)',
  POLITICS: '(politics OR election OR government OR parliament OR president OR senate OR policy)',
  WORLD: '(world news OR international OR diplomacy OR conflict OR climate)',
  BUSINESS: '(business OR company OR corporate OR earnings OR startup OR industry)',
  ECONOMY: '(economy OR inflation OR GDP OR interest rate OR central bank OR jobs OR trade)',
  TECHNOLOGY: '(technology OR software OR cybersecurity OR semiconductor OR smartphone)',
  AI: '("artificial intelligence" OR "AI model" OR "machine learning" OR "generative AI")',
  SCIENCE: '(science OR research OR space OR medicine OR discovery)',
  HEALTH: '(health OR healthcare OR public health OR disease OR medical research)',
  SPORTS: '(sports OR football OR soccer OR basketball OR tennis OR athletics)',
  MUSIC: '(music OR musician OR singer OR album OR concert OR chart)',
  ENTERTAINMENT: '(entertainment OR film OR movie OR television OR celebrity OR streaming)',
};
const ALLOWED_CATEGORIES = new Set<Category>(Object.keys(CATEGORY_QUERY) as Category[]);

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function safeText(value: unknown, max = 500): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max)
    : '';
}
function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return null;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
      || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return null;
    return u.toString().slice(0, 1800);
  } catch { return null; }
}
function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, number: string) => {
      const code = Number(number);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}
function seenDate(value: unknown): string | null {
  const raw = safeText(value, 40);
  if (!raw) return null;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(raw);
  const normalized = match
    ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`
    : raw;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
async function digest(value: string) {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
function json(payload: unknown, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Cache-Control': cacheSeconds > 0 ? 'public, max-age=15, s-maxage=' + Math.min(cacheSeconds, 300) : 'no-store',
    },
  });
}
function categoryOf(value: unknown): Category {
  const normalized = safeText(value, 40).toUpperCase() as Category;
  return ALLOWED_CATEGORIES.has(normalized) ? normalized : 'ALL';
}
function publisherFromUrl(url: string, domain?: unknown) {
  const value = safeText(domain, 180);
  if (value) return value.replace(/^www\./i, '');
  try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return 'News publisher'; }
}
function queryFor(category: Category, search: string) {
  const terms = search.trim().replace(/[\u0000-\u001f]/g, ' ').replace(/["<>]/g, ' ').replace(/\s+/g, ' ').slice(0, 100);
  const expression = terms ? '"' + terms.replace(/"/g, '') + '"' : CATEGORY_QUERY[category];
  const categoryConstraint = terms && category !== 'ALL' ? CATEGORY_QUERY[category] : '';
  return [expression, categoryConstraint, 'sourcelang:english'].filter(Boolean).join(' ');
}
async function fetchText(url: URL, maxBytes = 1_200_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'error',
      headers: {
        Accept: 'application/json,text/html;q=0.8,*/*;q=0.2',
        'User-Agent': 'VAD-News/1.0 (+https://vad-market.vercel.app)',
      },
    });
    if (!response.ok) throw new Error('News source returned HTTP ' + response.status + '.');
    const type = response.headers.get('content-type') ?? '';
    const raw = await response.text();
    if (raw.length > maxBytes) throw new Error('News source response exceeded the size limit.');
    return { raw, type };
  } finally { clearTimeout(timeout); }
}
function categoryTags(category: Category): string[] {
  return category === 'ALL' ? ['Latest news'] : [category.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())];
}
function htmlMeta(html: string, key: string, attribute: 'property' | 'name' = 'property'): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attr = new RegExp("\\b" + attribute + "\\s*=\\s*(['\"])(.*?)\\1", 'i').exec(tag)?.[2];
    if (attr?.toLowerCase() !== key.toLowerCase()) continue;
    const content = /\bcontent\s*=\s*(['"])([\s\S]*?)\1/i.exec(tag)?.[2];
    if (content) return decodeEntities(content).slice(0, 2000);
  }
  return null;
}
function htmlLink(html: string, rel: string): string | null {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const tagRel = /\brel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (tagRel?.toLowerCase().split(/\s+/).includes(rel) && href) return href;
  }
  return null;
}
function categoryForStory(title: string, requested: Category): Category {
  if (requested !== 'ALL') return requested;
  const text = title.toLowerCase();
  if (/election|president|parliament|senate|government|minister|politic|inec|vote/.test(text)) return 'POLITICS';
  if (/artificial intelligence|\bai\b|machine learning|openai|google deepmind|anthropic/.test(text)) return 'AI';
  if (/football|soccer|nba|tennis|premier league|champions league|sport|olympic/.test(text)) return 'SPORTS';
  if (/music|singer|album|concert|grammy/.test(text)) return 'MUSIC';
  if (/movie|film|actor|actress|netflix|entertainment|box office|television/.test(text)) return 'ENTERTAINMENT';
  if (/inflation|gdp|interest rate|central bank|unemployment|economy|economic/.test(text)) return 'ECONOMY';
  if (/stock|company|earnings|business|merger|market|bank/.test(text)) return 'BUSINESS';
  if (/health|hospital|disease|vaccine|medical/.test(text)) return 'HEALTH';
  if (/science|research|space|nasa|discovery|physics/.test(text)) return 'SCIENCE';
  if (/technology|software|cybersecurity|chip|semiconductor/.test(text)) return 'TECHNOLOGY';
  return 'WORLD';
}
async function listStories(category: Category, search: string, limit: number) {
  const key = 'list|' + category + '|' + search.toLowerCase() + '|' + limit;
  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.payload, cached: true };
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', queryFor(category, search));
  url.searchParams.set('mode', 'ArtList');
  url.searchParams.set('format', 'json');
  url.searchParams.set('maxrecords', String(Math.max(10, Math.min(50, limit))));
  url.searchParams.set('sort', 'DateDesc');
  url.searchParams.set('timespan', '3days');
  const response = await fetchText(url, 1_500_000);
  const payload = JSON.parse(response.raw) as unknown;
  if (!isRecord(payload)) throw new Error('The global news source returned an invalid response.');
  const rows = Array.isArray(payload.articles) ? payload.articles.filter(isRecord) : [];
  const stories: Story[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const title = safeText(row.title, 400);
    const articleUrl = safeHttpsUrl(row.url);
    if (!title || !articleUrl || seen.has(articleUrl)) continue;
    seen.add(articleUrl);
    const imageUrl = safeHttpsUrl(row.socialimage);
    stories.push({
      id: await digest(articleUrl),
      title,
      url: articleUrl,
      imageUrl,
      source: publisherFromUrl(articleUrl, row.domain),
      sourceCountry: safeText(row.sourcecountry, 80) || null,
      language: safeText(row.language, 40) || null,
      publishedAt: null,
      seenAt: seenDate(row.seendate),
      category: categoryForStory(title, category),
      summary: null,
      author: null,
      section: null,
      tags: categoryTags(categoryForStory(title, category)),
    });
  }
  const result = {
    source: 'GDELT global news index',
    fetchedAt: new Date().toISOString(),
    category,
    query: search,
    stories,
    notice: 'Images and source metadata are supplied by the publishers and indexed by GDELT. Publication timestamps may be absent from the index; open a story for publisher metadata and the original report.',
    cached: false,
  };
  CACHE.set(key, { expiresAt: Date.now() + TTL_MS, payload: result });
  while (CACHE.size > MAX_CACHE_ENTRIES) CACHE.delete(CACHE.keys().next().value!);
  return result;
}
async function articleDetails(rawUrl: unknown) {
  const urlText = safeHttpsUrl(rawUrl);
  if (!urlText) throw new Error('A valid HTTPS publisher link is required.');
  const url = new URL(urlText);
  // Do not turn the metadata reader into a proxy to local/private network services.
  if (url.port && url.port !== '443') throw new Error('This publisher link is not supported.');
  const response = await fetchText(url, 1_200_000);
  if (!response.type.toLowerCase().includes('text/html')) throw new Error('This publisher page does not expose readable article metadata.');
  const html = response.raw;
  const title = htmlMeta(html, 'og:title') ?? htmlMeta(html, 'twitter:title', 'name')
    ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/<[^>]*>/g, ' ')?.trim() ?? null;
  const summary = htmlMeta(html, 'og:description') ?? htmlMeta(html, 'description', 'name')
    ?? htmlMeta(html, 'twitter:description', 'name');
  const canonicalCandidate = htmlLink(html, 'canonical');
  const canonicalUrl = canonicalCandidate ? safeHttpsUrl(new URL(canonicalCandidate, url).toString()) : urlText;
  const imageCandidate = htmlMeta(html, 'og:image') ?? htmlMeta(html, 'twitter:image', 'name');
  const publishedAtCandidate = htmlMeta(html, 'article:published_time') ?? htmlMeta(html, 'datePublished', 'name')
    ?? htmlMeta(html, 'pubdate', 'name');
  const publishedDate = publishedAtCandidate ? new Date(publishedAtCandidate) : null;
  const keywords = (htmlMeta(html, 'keywords', 'name') ?? '').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 10);
  return {
    title: title ? decodeEntities(title).slice(0, 400) : null,
    url: urlText,
    canonicalUrl: canonicalUrl && new URL(canonicalUrl).hostname === url.hostname ? canonicalUrl : urlText,
    imageUrl: imageCandidate ? safeHttpsUrl(new URL(imageCandidate, url).toString()) : null,
    source: url.hostname.replace(/^www\./i, ''),
    publishedAt: publishedDate && Number.isFinite(publishedDate.getTime()) ? publishedDate.toISOString() : null,
    summary: summary ? summary.slice(0, 1200) : null,
    author: htmlMeta(html, 'author', 'name') ?? htmlMeta(html, 'article:author') ?? htmlMeta(html, 'parsely-author', 'name'),
    section: htmlMeta(html, 'article:section') ?? htmlMeta(html, 'section', 'name'),
    tags: keywords,
    language: htmlMeta(html, 'og:locale') ?? null,
    sourceCountry: null,
    publisherDetailsAvailable: Boolean(title || summary || imageCandidate || publishedAtCandidate),
  };
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    let body: RecordValue;
    try {
      const value = await req.json();
      if (!isRecord(value)) return json({ error: 'Invalid request body.' }, 400);
      body = value;
    } catch { return json({ error: 'Invalid JSON.' }, 400); }
    const action = safeText(body.action, 24).toLowerCase();
    if (action === 'details') {
      const key = 'detail|' + String(body.url ?? '');
      const cached = CACHE.get(key);
      if (cached && cached.expiresAt > Date.now()) return json(cached.payload, 200, 60);
      const detail = await articleDetails(body.url);
      CACHE.set(key, { expiresAt: Date.now() + 5 * TTL_MS, payload: detail });
      while (CACHE.size > MAX_CACHE_ENTRIES) CACHE.delete(CACHE.keys().next().value!);
      return json(detail, 200, 60);
    }
    if (action !== 'list') return json({ error: 'Choose a supported news action.' }, 400);
    const category = categoryOf(body.category);
    const query = safeText(body.query, 100);
    const limit = Math.max(10, Math.min(50, Math.floor(Number(body.limit) || 24)));
    return json(await listStories(category, query, limit), 200, 30);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The global news source is temporarily unavailable.';
    return json({ error: message }, /HTTP 429|rate limit/i.test(message) ? 429 : 502);
  }
});
