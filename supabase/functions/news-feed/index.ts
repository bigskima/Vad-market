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
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')
      || (u.port && u.port !== '443')) return null;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
      || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[')
      || host.endsWith('.internal') || host.endsWith('.test')) return null;
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
type FeedDefinition = { label: string; url: string; category: Category; country?: 'NG' | 'AF' | null };

const NIGERIA_FEEDS = {
  latest: { label: 'PUNCH Nigeria', url: 'https://rss.punchng.com/v1/category/latest_news', category: 'WORLD' as Category, country: 'NG' as const },
  politics: { label: 'PUNCH Politics', url: 'https://rss.punchng.com/v1/category/politics', category: 'POLITICS' as Category, country: 'NG' as const },
  business: { label: 'PUNCH Business', url: 'https://rss.punchng.com/v1/category/business', category: 'BUSINESS' as Category, country: 'NG' as const },
  technology: { label: 'PUNCH Technology', url: 'https://rss.punchng.com/v1/category/technology', category: 'TECHNOLOGY' as Category, country: 'NG' as const },
  entertainment: { label: 'PUNCH Entertainment', url: 'https://rss.punchng.com/v1/category/entertainment', category: 'ENTERTAINMENT' as Category, country: 'NG' as const },
  health: { label: 'PUNCH Health', url: 'https://rss.punchng.com/v1/category/health', category: 'HEALTH' as Category, country: 'NG' as const },
  premiumTimes: { label: 'Premium Times Nigeria', url: 'https://www.premiumtimesng.com/feed', category: 'WORLD' as Category, country: 'NG' as const },
  guardianNigeria: { label: 'The Guardian Nigeria', url: 'https://guardian.ng/feed/', category: 'WORLD' as Category, country: 'NG' as const },
};
const AFRICA_FEEDS = {
  africanews: { label: 'Africanews', url: 'https://www.africanews.com/feed/rss', category: 'WORLD' as Category, country: 'AF' as const },
};
const FEEDS: Record<Category, FeedDefinition[]> = {
  ALL: [
    NIGERIA_FEEDS.latest,
    NIGERIA_FEEDS.premiumTimes,
    NIGERIA_FEEDS.guardianNigeria,
    AFRICA_FEEDS.africanews,
    NIGERIA_FEEDS.technology,
    { label: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', category: 'WORLD' },
    { label: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'WORLD' },
    { label: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'BUSINESS' },
    { label: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', category: 'TECHNOLOGY' },
    { label: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', category: 'WORLD' },
    { label: 'The Guardian Culture', url: 'https://www.theguardian.com/uk/culture/rss', category: 'ENTERTAINMENT' },
    { label: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'SPORTS' },
  ],
  POLITICS: [
    NIGERIA_FEEDS.politics, NIGERIA_FEEDS.latest, NIGERIA_FEEDS.premiumTimes, NIGERIA_FEEDS.guardianNigeria,
    AFRICA_FEEDS.africanews,
    { label: 'BBC Politics', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', category: 'POLITICS' },
    { label: 'The Guardian Politics', url: 'https://www.theguardian.com/politics/rss', category: 'POLITICS' },
    { label: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'WORLD' },
  ],
  WORLD: [
    NIGERIA_FEEDS.latest, NIGERIA_FEEDS.premiumTimes, NIGERIA_FEEDS.guardianNigeria, AFRICA_FEEDS.africanews,
    { label: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'WORLD' },
    { label: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', category: 'WORLD' },
    { label: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'WORLD' },
  ],
  BUSINESS: [
    NIGERIA_FEEDS.business, NIGERIA_FEEDS.premiumTimes, NIGERIA_FEEDS.guardianNigeria, AFRICA_FEEDS.africanews,
    { label: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'BUSINESS' },
    { label: 'The Guardian Business', url: 'https://www.theguardian.com/uk/business/rss', category: 'BUSINESS' },
    { label: 'Sky News Business', url: 'https://feeds.skynews.com/feeds/rss/business.xml', category: 'BUSINESS' },
  ],
  ECONOMY: [
    NIGERIA_FEEDS.business, NIGERIA_FEEDS.latest, NIGERIA_FEEDS.premiumTimes, NIGERIA_FEEDS.guardianNigeria, AFRICA_FEEDS.africanews,
    { label: 'BBC Economy', url: 'https://feeds.bbci.co.uk/news/business/economy/rss.xml', category: 'ECONOMY' },
    { label: 'The Guardian Business', url: 'https://www.theguardian.com/uk/business/rss', category: 'ECONOMY' },
    { label: 'Sky News Business', url: 'https://feeds.skynews.com/feeds/rss/business.xml', category: 'ECONOMY' },
  ],
  TECHNOLOGY: [
    NIGERIA_FEEDS.technology, NIGERIA_FEEDS.latest, NIGERIA_FEEDS.guardianNigeria, NIGERIA_FEEDS.premiumTimes, AFRICA_FEEDS.africanews,
    { label: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', category: 'TECHNOLOGY' },
    { label: 'The Guardian Technology', url: 'https://www.theguardian.com/uk/technology/rss', category: 'TECHNOLOGY' },
    { label: 'Sky News Technology', url: 'https://feeds.skynews.com/feeds/rss/technology.xml', category: 'TECHNOLOGY' },
  ],
  AI: [
    NIGERIA_FEEDS.technology, NIGERIA_FEEDS.guardianNigeria, NIGERIA_FEEDS.premiumTimes, AFRICA_FEEDS.africanews,
    { label: 'The Guardian AI', url: 'https://www.theguardian.com/technology/artificialintelligenceai/rss', category: 'AI' },
    { label: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', category: 'TECHNOLOGY' },
    { label: 'The Guardian Technology', url: 'https://www.theguardian.com/uk/technology/rss', category: 'TECHNOLOGY' },
  ],
  SCIENCE: [
    NIGERIA_FEEDS.guardianNigeria, AFRICA_FEEDS.africanews,
    { label: 'BBC Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', category: 'SCIENCE' },
    { label: 'The Guardian Science', url: 'https://www.theguardian.com/science/rss', category: 'SCIENCE' },
  ],
  HEALTH: [
    NIGERIA_FEEDS.health, NIGERIA_FEEDS.latest, NIGERIA_FEEDS.guardianNigeria, AFRICA_FEEDS.africanews,
    { label: 'BBC Health', url: 'https://feeds.bbci.co.uk/news/health/rss.xml', category: 'HEALTH' },
    { label: 'The Guardian Society', url: 'https://www.theguardian.com/society/rss', category: 'HEALTH' },
  ],
  SPORTS: [
    NIGERIA_FEEDS.latest, NIGERIA_FEEDS.guardianNigeria, AFRICA_FEEDS.africanews,
    { label: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'SPORTS' },
    { label: 'Sky News Sport', url: 'https://feeds.skynews.com/feeds/rss/sports.xml', category: 'SPORTS' },
  ],
  MUSIC: [
    NIGERIA_FEEDS.entertainment, NIGERIA_FEEDS.guardianNigeria, AFRICA_FEEDS.africanews,
    { label: 'The Guardian Music', url: 'https://www.theguardian.com/music/rss', category: 'MUSIC' },
    { label: 'BBC Entertainment & Arts', url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', category: 'ENTERTAINMENT' },
  ],
  ENTERTAINMENT: [
    NIGERIA_FEEDS.entertainment, NIGERIA_FEEDS.latest, NIGERIA_FEEDS.guardianNigeria, AFRICA_FEEDS.africanews,
    { label: 'BBC Entertainment & Arts', url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', category: 'ENTERTAINMENT' },
    { label: 'The Guardian Culture', url: 'https://www.theguardian.com/uk/culture/rss', category: 'ENTERTAINMENT' },
    { label: 'Sky News Entertainment', url: 'https://feeds.skynews.com/feeds/rss/entertainment.xml', category: 'ENTERTAINMENT' },
  ],
};

function xmlText(value: string): string {
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(value)?.[1] ?? value;
  return decodeEntities(cdata.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function xmlTag(xml: string, tagName: string): string | null {
  const escaped = tagName.replace(/[.*+?^$|{}()[\]\\]/g, '\\$&');
  const match = new RegExp('<' + escaped + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + escaped + '\\s*>', 'i').exec(xml);
  return match?.[1] ?? null;
}
function xmlAttr(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^$|{}()[\]\\]/g, '\\$&');
  const doubleQuoted = new RegExp('\\b' + escaped + '\\s*=\\s*"([^"]*)"', 'i').exec(tag)?.[1];
  const singleQuoted = new RegExp("\\b" + escaped + "\\s*=\\s*'([^']*)'", 'i').exec(tag)?.[1];
  const value = doubleQuoted ?? singleQuoted;
  return value ? decodeEntities(value) : null;
}
function firstXmlImage(item: string): string | null {
  const candidates = [...item.matchAll(/<(?:media:content|media:thumbnail|itunes:image)\b[^>]*>/gi)];
  for (const match of candidates) {
    const tag = match[0];
    const raw = xmlAttr(tag, 'url') ?? xmlAttr(tag, 'href');
    const safe = safeHttpsUrl(raw);
    if (safe) return safe;
  }
  const description = xmlTag(item, 'media:description') ?? xmlTag(item, 'description') ?? xmlTag(item, 'content:encoded') ?? '';
  const htmlImage = /<img\b[^>]*\b(?:src|data-src)\s*=\s*(['"])(.*?)\1/i.exec(description)?.[2];
  if (htmlImage) {
    const imageUrl = safeHttpsUrl(htmlImage);
    if (imageUrl) return imageUrl;
  }
  return null;
}
function parseFeed(xml: string, feed: FeedDefinition): Story[] {
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)].map((match) => match[1]);
  return blocks.flatMap((item): Story[] => {
    const titleRaw = xmlTag(item, 'title');
    const rawLink = xmlTag(item, 'link') ?? xmlAttr(/<link\b[^>]*>/i.exec(item)?.[0] ?? '', 'href');
    const url = safeHttpsUrl(rawLink ? xmlText(rawLink) : null);
    const title = titleRaw ? xmlText(titleRaw).replace(/\s+-\s+(?:BBC News|BBC Sport|The Guardian|Sky News|Al Jazeera)$/i, '').trim() : '';
    if (!title || !url || title.length < 8) return [];
    const description = xmlTag(item, 'description') ?? xmlTag(item, 'content:encoded') ?? '';
    const summary = description ? xmlText(description).slice(0, 450) : '';
    const sourceTag = xmlTag(item, 'source');
    const sourceLabel = sourceTag ? xmlText(sourceTag) : '';
    const publishedRaw = xmlTag(item, 'pubDate') ?? xmlTag(item, 'dc:date') ?? xmlTag(item, 'published') ?? xmlTag(item, 'updated');
    const parsedDate = publishedRaw ? new Date(xmlText(publishedRaw)) : null;
    const publishedAt = parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : null;
    const imageUrl = firstXmlImage(item);
    const inferredCategory = categoryForStory(title + ' ' + summary, feed.category);
    return [{
      id: '',
      title: title.slice(0, 400),
      url,
      imageUrl,
      source: sourceLabel || publisherFromUrl(url),
      sourceCountry: feed.country ?? null,
      language: 'en',
      publishedAt,
      seenAt: publishedAt,
      category: inferredCategory,
      summary: summary || null,
      author: xmlTag(item, 'dc:creator') ? xmlText(xmlTag(item, 'dc:creator')!) : null,
      section: feed.category.replace(/_/g, ' '),
      tags: categoryTags(inferredCategory),
    }];
  });
}
async function fetchRssFeed(feed: FeedDefinition): Promise<Story[]> {
  const cached = CACHE.get('rss|' + feed.url);
  if (cached && cached.expiresAt > Date.now()) {
    return Array.isArray(cached.payload.stories) ? cached.payload.stories as Story[] : [];
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3800);
  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.2',
        'User-Agent': 'VAD-News/1.0 (publisher-attributed headlines)',
      },
    });
    if (!response.ok) throw new Error(feed.label + ' returned HTTP ' + response.status);
    const xml = await response.text();
    if (xml.length > 700_000 || !/<(?:rss|rdf:RDF|feed)\b/i.test(xml.slice(0, 6000))) {
      throw new Error(feed.label + ' returned an invalid RSS feed');
    }
    const parsed = parseFeed(xml, feed).slice(0, 50);
    CACHE.set('rss|' + feed.url, { expiresAt: Date.now() + 5 * 60_000, payload: { stories: parsed } });
    return parsed;
  } finally { clearTimeout(timeout); }
}
function matchesSearch(story: Story, search: string) {
  if (!search) return true;
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const text = (story.title + ' ' + (story.summary ?? '') + ' ' + story.source).toLowerCase();
  return terms.every((term) => text.includes(term));
}
async function listStories(category: Category, search: string, limit: number) {
  const key = 'list|' + category + '|' + search.toLowerCase() + '|' + limit;
  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.payload, cached: true };

  const feedResults = await Promise.allSettled((FEEDS[category] ?? FEEDS.ALL).map(fetchRssFeed));
  const flattened = feedResults.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  const unique = new Map<string, Story>();
  for (const story of flattened) {
    if (!matchesSearch(story, search)) continue;
    const displayStory = category === 'ALL'
      ? story
      : { ...story, category, tags: categoryTags(category) };
    const keyByUrl = story.url.toLowerCase().replace(/\/$/, '');
    const current = unique.get(keyByUrl);
    if (!current || (!current.imageUrl && displayStory.imageUrl)) unique.set(keyByUrl, displayStory);
  }
  let stories = await Promise.all([...unique.values()].map(async (story) => ({ ...story, id: await digest(story.url) })));
  // Nigeria first, then continental African coverage, followed by global
  // sources; publication time orders stories within each region.
  stories.sort((a, b) => {
    const rank = (value: string | null) => value === 'NG' ? 0 : value === 'AF' ? 1 : 2;
    return rank(a.sourceCountry) - rank(b.sourceCountry)
      || Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? '');
  });
  stories = stories.slice(0, Math.max(10, Math.min(50, limit)));

  if (!stories.length) {
    throw new Error(feedResults.every((result) => result.status === 'rejected')
      ? 'News providers are temporarily unavailable. Please retry.'
      : 'No stories are available for this category yet.');
  }
  const publishers = [...new Set(stories.map((story) => story.source))];
  const result = {
    source: publishers.length > 1 ? 'Multiple news publishers' : publishers[0] ?? 'News publisher',
    fetchedAt: new Date().toISOString(),
    category,
    query: search,
    stories,
    notice: null,
    cached: false,
  };
  CACHE.set(key, { expiresAt: Date.now() + 60_000, payload: result });
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
