import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

const json = (body: unknown, status = 200, cacheSeconds = 0) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': cacheSeconds > 0
        ? `private, max-age=15, s-maxage=${cacheSeconds}`
        : 'no-store',
    },
  });

type MarketDataSource = {
  code: string;
  name: string;
  base_url: string;
  status: 'ACTIVE' | 'DISABLED';
  quote_currency: string;
  default_page_size: number;
  cache_seconds: number;
};

type CoinMarketRow = {
  id?: unknown;
  symbol?: unknown;
  name?: unknown;
  image?: unknown;
  current_price?: unknown;
  market_cap?: unknown;
  market_cap_rank?: unknown;
  total_volume?: unknown;
  price_change_percentage_24h?: unknown;
  sparkline_in_7d?: { price?: unknown };
  last_updated?: unknown;
};

function safeNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeText(value: unknown, limit = 180): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function normalizeCoin(row: CoinMarketRow) {
  const sparkline = row.sparkline_in_7d && typeof row.sparkline_in_7d === 'object'
    ? (row.sparkline_in_7d as { price?: unknown }).price
    : null;
  const sparklinePrices = Array.isArray(sparkline)
    ? sparkline.map(safeNumber).filter((value): value is number => value !== null)
    : [];
  const image = safeText(row.image, 500);

  return {
    id: safeText(row.id, 100),
    symbol: safeText(row.symbol, 30).toUpperCase(),
    name: safeText(row.name, 160),
    imageUrl: image.startsWith('https://') ? image : null,
    currentPrice: safeNumber(row.current_price),
    marketCap: safeNumber(row.market_cap),
    marketCapRank: safeNumber(row.market_cap_rank),
    totalVolume: safeNumber(row.total_volume),
    change24hPercent: safeNumber(row.price_change_percentage_24h),
    sparkline7d: sparklinePrices.slice(-168),
    sourceUpdatedAt: safeText(row.last_updated, 80) || null,
  };
}

async function providerJson(url: URL, apiKey: string | null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { 'x-cg-demo-api-key': apiKey } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(response.status === 429
        ? 'The public crypto market-data source is rate-limited. Try again shortly.'
        : `The public crypto market-data source returned HTTP ${response.status}.`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The public crypto market-data request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let stalePayload: Record<string, unknown> | null = null;
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = req.headers.get('Authorization') ?? '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!supabaseUrl || !serviceKey || !token) return json({ error: 'Authentication required' }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: 'Authentication required' }, 401);

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return json({ error: 'Invalid request body' }, 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const page = Math.max(1, Math.min(1000, Math.floor(safeNumber(body.page) ?? 1)));
    const requestedSize = safeNumber(body.perPage);
    const query = safeText(body.query, 100);
    const { data: source, error: sourceError } = await admin
      .schema('market')
      .from('market_data_sources')
      .select('code,name,base_url,status,quote_currency,default_page_size,cache_seconds')
      .eq('code', 'COINGECKO')
      .maybeSingle();

    if (sourceError) return json({ error: 'Market data settings are unavailable.' }, 503);
    if (!source) return json({ error: 'The crypto market-data source is not configured.' }, 503);
    const feed = source as MarketDataSource;
    if (feed.status !== 'ACTIVE') {
      return json({
        error: 'Live crypto market data is temporarily disabled by VAD administrators.',
        code: 'MARKET_DATA_SOURCE_DISABLED',
      }, 503);
    }

    let baseUrl: URL;
    try {
      baseUrl = new URL(feed.base_url);
    } catch {
      return json({ error: 'The market-data source URL is invalid.' }, 503);
    }
    // The app cannot supply a provider URL. Only the configured CoinGecko public API
    // host is allowed here, which avoids turning this proxy into an arbitrary fetcher.
    if (baseUrl.protocol !== 'https:' || !['api.coingecko.com', 'pro-api.coingecko.com'].includes(baseUrl.hostname)) {
      return json({ error: 'The configured crypto market-data source host is not permitted.' }, 503);
    }
    const apiKey = Deno.env.get('COINGECKO_API_KEY')?.trim() || null;
    const perPage = Math.max(1, Math.min(100, Math.floor(requestedSize ?? feed.default_page_size)));
    const quoteCurrency = feed.quote_currency.toLowerCase();
    const queryKey = query.trim().toLowerCase();
    const cacheKey = `${feed.code}:${quoteCurrency}:${page}:${perPage}:${queryKey}`;
    const { data: cachedRow, error: cacheReadError } = await admin
      .schema('market')
      .from('market_data_cache')
      .select('payload,fetched_at,expires_at,stale_until')
      .eq('request_key', cacheKey)
      .maybeSingle();

    if (cacheReadError) {
      console.warn('Crypto market-data cache read failed', cacheReadError.code);
    } else if (cachedRow?.payload && typeof cachedRow.payload === 'object' && !Array.isArray(cachedRow.payload)) {
      const payload = cachedRow.payload as Record<string, unknown>;
      if (Date.parse(String(cachedRow.expires_at)) > Date.now()) {
        return json({ ...payload, cached: true }, 200, Math.min(Math.max(feed.cache_seconds, 15), 3600));
      }
      if (Date.parse(String(cachedRow.stale_until)) > Date.now()) stalePayload = payload;
    }

    let coinRows: CoinMarketRow[] = [];
    let hasMore = false;

    if (query) {
      const searchUrl = new URL('/api/v3/search', baseUrl.origin);
      searchUrl.searchParams.set('query', query);
      const searchPayload = await providerJson(searchUrl, apiKey) as { coins?: unknown };
      const coins = Array.isArray(searchPayload?.coins)
        ? searchPayload.coins as Array<Record<string, unknown>>
        : [];
      const start = (page - 1) * perPage;
      const matches = coins
        .filter((coin) => safeText(coin.id, 100))
        .slice(start, start + perPage);
      hasMore = coins.length > start + matches.length;

      if (matches.length) {
        const ids = matches.map((coin) => safeText(coin.id, 100)).join(',');
        const marketsUrl = new URL('/api/v3/coins/markets', baseUrl.origin);
        marketsUrl.searchParams.set('vs_currency', quoteCurrency);
        marketsUrl.searchParams.set('ids', ids);
        marketsUrl.searchParams.set('order', 'market_cap_desc');
        marketsUrl.searchParams.set('per_page', String(perPage));
        marketsUrl.searchParams.set('page', '1');
        marketsUrl.searchParams.set('sparkline', 'true');
        marketsUrl.searchParams.set('price_change_percentage', '24h');
        const payload = await providerJson(marketsUrl, apiKey);
        if (!Array.isArray(payload)) throw new Error('The crypto market-data response was invalid.');
        coinRows = payload as CoinMarketRow[];
      }
    } else {
      const marketsUrl = new URL('/api/v3/coins/markets', baseUrl.origin);
      marketsUrl.searchParams.set('vs_currency', quoteCurrency);
      marketsUrl.searchParams.set('order', 'market_cap_desc');
      marketsUrl.searchParams.set('per_page', String(perPage));
      marketsUrl.searchParams.set('page', String(page));
      marketsUrl.searchParams.set('sparkline', 'true');
      marketsUrl.searchParams.set('price_change_percentage', '24h');
      const payload = await providerJson(marketsUrl, apiKey);
      if (!Array.isArray(payload)) throw new Error('The crypto market-data response was invalid.');
      coinRows = payload as CoinMarketRow[];
      hasMore = coinRows.length === perPage && page < 1000;
    }

    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + Math.min(Math.max(feed.cache_seconds, 15), 3600) * 1000);
    const staleUntil = new Date(fetchedAt.getTime() + 6 * 60 * 60 * 1000);
    const responsePayload = {
      ok: true,
      source: 'COINGECKO',
      dataPurpose: 'DISPLAY_ONLY',
      quoteCurrency: feed.quote_currency,
      page,
      perPage,
      query: query || null,
      hasMore,
      fetchedAt: fetchedAt.toISOString(),
      coins: coinRows.map(normalizeCoin).filter((coin) => coin.id && coin.currentPrice !== null),
    };
    const { error: cacheWriteError } = await admin.schema('market').from('market_data_cache').upsert({
      request_key: cacheKey,
      payload: responsePayload,
      fetched_at: fetchedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      stale_until: staleUntil.toISOString(),
      updated_at: fetchedAt.toISOString(),
    }, { onConflict: 'request_key' });
    if (cacheWriteError) console.warn('Crypto market-data cache write failed', cacheWriteError.code);

    return json(responsePayload, 200, Math.min(Math.max(feed.cache_seconds, 15), 3600));
  } catch (error) {
    if (stalePayload) {
      return json({ ...stalePayload, cached: true, stale: true }, 200, 15);
    }
    return json({
      error: error instanceof Error ? error.message : 'Crypto market data is temporarily unavailable.',
    }, 502);
  }
});
