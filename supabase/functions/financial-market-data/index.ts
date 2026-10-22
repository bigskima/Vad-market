import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
type JsonRecord = Record<string, unknown>;
type AssetClass = 'STOCKS' | 'COMMODITIES' | 'FOREX' | 'ECONOMICS';
type Source = {
  code: string; name: string; baseUrl: string; status: string; quoteCurrency: string;
  defaultPageSize: number; cacheSeconds: number; assetClass: AssetClass; adapterCode: string;
  dailyRequestLimit: number; secretReference: string | null; providerMetadata: JsonRecord;
};
type AssetQuote = {
  id: string; symbol: string; name: string; assetClass: AssetClass; quoteCurrency: string;
  currentPrice: number | null; change24hPercent: number | null; open: number | null;
  high: number | null; low: number | null; volume: number | null;
  marketOpen: boolean | null; sourceUpdatedAt: string | null; exchange: string | null;
  source: string; sourceCode: string;
};

const json = (body: unknown, status = 200, cacheSeconds = 0) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
    'Cache-Control': cacheSeconds > 0
      ? 'private, max-age=15, s-maxage=' + Math.min(cacheSeconds, 3600)
      : 'no-store',
  },
});

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function textValue(value: unknown, max = 180): string {
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max) : '';
}
function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function dateValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  const timestamp = numberValue(value);
  return timestamp !== null && timestamp > 0 && timestamp < 10_000_000_000
    ? new Date(timestamp * 1000).toISOString()
    : null;
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function requestJson(url: URL, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: 'GET', signal: controller.signal, headers: { Accept: 'application/json', ...headers },
      redirect: 'error',
    });
    if (!response.ok) throw new Error(response.status === 429
      ? 'The configured financial-data provider reached its rate limit.'
      : 'The configured financial-data provider returned HTTP ' + response.status + '.');
    const raw = await response.text();
    if (raw.length > 1_500_000) throw new Error('The financial-data response exceeded the size limit.');
    try { return JSON.parse(raw) as unknown; } catch { throw new Error('The financial-data provider returned invalid JSON.'); }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The financial-data request timed out.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function safeEndpoint(source: Source) {
  const url = new URL(source.baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The configured data source must use HTTPS.');
  if (source.adapterCode === 'TWELVE_DATA_QUOTE' && url.hostname !== 'api.twelvedata.com') {
    throw new Error('The Twelve Data adapter only permits api.twelvedata.com.');
  }
  if (source.adapterCode === 'FRED_SERIES' && (url.hostname !== 'api.stlouisfed.org' || !url.pathname.startsWith('/fred'))) {
    throw new Error('The FRED adapter only permits the approved St. Louis Fed API host and path.');
  }
  return url.origin;
}
function configuredCredential(source: Source) {
  const ref = textValue(source.secretReference, 100);
  return ref ? Deno.env.get(ref)?.trim() ?? '' : '';
}

async function twelveDataQuotes(source: Source, query: string, apiKey: string): Promise<AssetQuote[]> {
  const origin = safeEndpoint(source);
  const searchUrl = new URL('/symbol_search', origin);
  searchUrl.searchParams.set('symbol', query);
  searchUrl.searchParams.set('apikey', apiKey);
  const payload = await requestJson(searchUrl);
  if (!isRecord(payload)) throw new Error('Twelve Data returned an invalid symbol-search response.');
  if (payload.status === 'error') throw new Error(textValue(payload.message, 500) || 'Twelve Data symbol search failed.');
  const rows = Array.isArray(payload.data) ? payload.data.filter(isRecord) : [];
  const matches = rows.slice(0, Math.max(1, Math.min(4, source.defaultPageSize)));
  const quotes: AssetQuote[] = [];
  for (const row of matches) {
    const symbol = textValue(row.symbol, 80);
    if (!symbol) continue;
    const quoteUrl = new URL('/quote', origin);
    quoteUrl.searchParams.set('symbol', symbol);
    quoteUrl.searchParams.set('apikey', apiKey);
    let quote: unknown;
    try {
      quote = await requestJson(quoteUrl);
    } catch {
      // Symbol search remains useful when a market-data entitlement does not
      // allow a quote for an otherwise recognised instrument.
      quotes.push({
        id: symbol, symbol, name: textValue(row.instrument_name, 180) || symbol,
        assetClass: source.assetClass, quoteCurrency: textValue(row.currency, 12) || source.quoteCurrency,
        currentPrice: null, change24hPercent: null, open: null, high: null, low: null, volume: null,
        marketOpen: null, sourceUpdatedAt: null, exchange: textValue(row.exchange, 120) || null,
        source: source.name, sourceCode: source.code,
      });
      continue;
    }
    if (!isRecord(quote) || quote.status === 'error') {
      quotes.push({
        id: symbol, symbol, name: textValue(row.instrument_name, 180) || symbol,
        assetClass: source.assetClass, quoteCurrency: textValue(row.currency, 12) || source.quoteCurrency,
        currentPrice: null, change24hPercent: null, open: null, high: null, low: null, volume: null,
        marketOpen: null, sourceUpdatedAt: null, exchange: textValue(row.exchange, 120) || null,
        source: source.name, sourceCode: source.code,
      });
      continue;
    }
    const currentPrice = numberValue(quote.close) ?? numberValue(quote.price);
    quotes.push({
      id: symbol, symbol,
      name: textValue(quote.name, 180) || textValue(row.instrument_name, 180) || symbol,
      assetClass: source.assetClass,
      quoteCurrency: textValue(quote.currency, 12) || textValue(row.currency, 12) || source.quoteCurrency,
      currentPrice,
      change24hPercent: numberValue(quote.percent_change),
      open: numberValue(quote.open), high: numberValue(quote.high), low: numberValue(quote.low),
      volume: numberValue(quote.volume),
      marketOpen: typeof quote.is_market_open === 'boolean' ? quote.is_market_open : null,
      sourceUpdatedAt: dateValue(quote.timestamp) || dateValue(quote.datetime),
      exchange: textValue(quote.exchange, 120) || textValue(row.exchange, 120) || null,
      source: source.name, sourceCode: source.code,
    });
  }
  return quotes;
}


function browseSymbols(source: Source): Array<{ symbol: string; name: string }> {
  const raw = source.providerMetadata.browse_symbols;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((row) => ({
    symbol: textValue(row.symbol, 80),
    name: textValue(row.name, 180),
  })).filter((row) => row.symbol);
}

async function twelveDataBrowse(source: Source, apiKey: string): Promise<AssetQuote[]> {
  const origin = safeEndpoint(source);
  const definitions = browseSymbols(source).slice(0, Math.max(1, Math.min(8, source.defaultPageSize)));
  const results: AssetQuote[] = [];
  for (const definition of definitions) {
    const quoteUrl = new URL('/quote', origin);
    quoteUrl.searchParams.set('symbol', definition.symbol);
    quoteUrl.searchParams.set('apikey', apiKey);
    let payload: unknown;
    try {
      payload = await requestJson(quoteUrl);
    } catch {
      continue; // A provider may not entitle every symbol; keep the rest of the catalogue usable.
    }
    if (!isRecord(payload) || payload.status === 'error') continue;
    const price = numberValue(payload.close) ?? numberValue(payload.price);
    if (price === null) continue;
    results.push({
      id: definition.symbol,
      symbol: textValue(payload.symbol, 80) || definition.symbol,
      name: textValue(payload.name, 180) || definition.name || definition.symbol,
      assetClass: source.assetClass,
      quoteCurrency: textValue(payload.currency, 12) || source.quoteCurrency,
      currentPrice: price,
      change24hPercent: numberValue(payload.percent_change),
      open: numberValue(payload.open),
      high: numberValue(payload.high),
      low: numberValue(payload.low),
      volume: numberValue(payload.volume),
      marketOpen: typeof payload.is_market_open === 'boolean' ? payload.is_market_open : null,
      sourceUpdatedAt: dateValue(payload.timestamp) || dateValue(payload.datetime),
      exchange: textValue(payload.exchange, 120) || null,
      source: source.name,
      sourceCode: source.code,
    });
  }
  return results;
}

async function fredQuotes(source: Source, query: string, apiKey: string): Promise<AssetQuote[]> {
  const origin = safeEndpoint(source);
  let rows: JsonRecord[] = [];
  if (!query.trim()) {
    const featured = source.providerMetadata.featured_series;
    rows = Array.isArray(featured) ? featured.filter(isRecord).slice(0, 6) : [];
  } else {
    const searchUrl = new URL('/fred/series/search', origin);
    searchUrl.searchParams.set('search_text', query);
    searchUrl.searchParams.set('api_key', apiKey);
    searchUrl.searchParams.set('file_type', 'json');
    searchUrl.searchParams.set('limit', '4');
    searchUrl.searchParams.set('order_by', 'popularity');
    searchUrl.searchParams.set('sort_order', 'desc');
    const payload = await requestJson(searchUrl);
    if (!isRecord(payload)) throw new Error('FRED returned an invalid series-search response.');
    if (payload.error_code) throw new Error(textValue(payload.error_message, 500) || 'FRED series search failed.');
    rows = Array.isArray(payload.seriess) ? payload.seriess.filter(isRecord) : [];
  }
  const items: AssetQuote[] = [];
  for (const row of rows.slice(0, 3)) {
    const id = textValue(row.id, 80);
    if (!id) continue;
    const observationUrl = new URL('/fred/series/observations', origin);
    observationUrl.searchParams.set('series_id', id);
    observationUrl.searchParams.set('api_key', apiKey);
    observationUrl.searchParams.set('file_type', 'json');
    observationUrl.searchParams.set('sort_order', 'desc');
    observationUrl.searchParams.set('limit', '1');
    const observationPayload = await requestJson(observationUrl).catch(() => null);
    const observations = isRecord(observationPayload) && Array.isArray(observationPayload.observations)
      ? observationPayload.observations.filter(isRecord) : [];
    const latest = observations[0] ?? {};
    items.push({
      id, symbol: id, name: textValue(row.title, 180) || id,
      assetClass: 'ECONOMICS', quoteCurrency: 'index',
      currentPrice: numberValue(latest.value), change24hPercent: null,
      open: null, high: null, low: null, volume: null, marketOpen: null,
      sourceUpdatedAt: dateValue(latest.date),
      exchange: [textValue(row.units, 80), textValue(row.frequency, 100)].filter(Boolean).join(' · ') || null,
      source: source.name, sourceCode: source.code,
    });
  }
  return items;
}


async function requestText(url: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/plain' }, redirect: 'error' });
    if (!response.ok) throw new Error('Public data source returned HTTP ' + response.status + '.');
    const raw = await response.text();
    if (raw.length > 1_500_000) throw new Error('Public data response exceeded the size limit.');
    return raw;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Public data request timed out.');
    throw error;
  } finally { clearTimeout(timer); }
}

function publicQuote(input: {
  id: string; symbol: string; name: string; assetClass: AssetClass; quoteCurrency: string;
  currentPrice: number; previousClose?: number | null; open?: number | null;
  high?: number | null; low?: number | null; volume?: number | null;
  marketOpen?: boolean | null; sourceUpdatedAt?: string | null; exchange?: string | null;
  source: string; sourceCode: string;
}): AssetQuote {
  const change = input.previousClose != null && input.previousClose !== 0
    ? ((input.currentPrice / input.previousClose) - 1) * 100 : null;
  return {
    id: input.id, symbol: input.symbol, name: input.name, assetClass: input.assetClass,
    quoteCurrency: input.quoteCurrency, currentPrice: input.currentPrice, change24hPercent: change,
    open: input.open ?? null, high: input.high ?? null, low: input.low ?? null, volume: input.volume ?? null,
    marketOpen: input.marketOpen ?? null, sourceUpdatedAt: input.sourceUpdatedAt ?? null,
    exchange: input.exchange ?? null, source: input.source, sourceCode: input.sourceCode,
  };
}

async function yahooChart(symbol: string, name: string, assetClass: AssetClass, quoteCurrency = 'USD'): Promise<AssetQuote | null> {
  if (!/^[A-Za-z0-9.^=_-]{1,40}$/.test(symbol)) return null;
  const url = new URL('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol));
  url.searchParams.set('range', '1d');
  url.searchParams.set('interval', '5m');
  const payload = await requestJson(url, { 'User-Agent': 'Mozilla/5.0 VADMarket/1.0' });
  if (!isRecord(payload) || !isRecord(payload.chart) || !Array.isArray(payload.chart.result)) return null;
  const result = payload.chart.result[0];
  if (!isRecord(result) || !isRecord(result.meta)) return null;
  const meta = result.meta;
  const indicators = isRecord(result.indicators) ? result.indicators : {};
  const quotes = Array.isArray(indicators.quote) ? indicators.quote : [];
  const bars = isRecord(quotes[0]) ? quotes[0] : {};
  const lastNumber = (value: unknown) => {
    if (!Array.isArray(value)) return null;
    for (let i = value.length - 1; i >= 0; i -= 1) {
      const number = numberValue(value[i]);
      if (number !== null) return number;
    }
    return null;
  };
  const price = numberValue(meta.regularMarketPrice) ?? lastNumber(bars.close);
  if (price === null) return null;
  const tradingPeriod = isRecord(meta.currentTradingPeriod) ? meta.currentTradingPeriod : {};
  const regular = isRecord(tradingPeriod.regular) ? tradingPeriod.regular : {};
  const start = numberValue(regular.start);
  const end = numberValue(regular.end);
  const now = Math.floor(Date.now() / 1000);
  return publicQuote({
    id: symbol, symbol: textValue(meta.symbol, 40) || symbol,
    name: name || textValue(meta.longName, 180) || textValue(meta.shortName, 180) || symbol,
    assetClass, quoteCurrency: textValue(meta.currency, 12) || quoteCurrency, currentPrice: price,
    previousClose: numberValue(meta.chartPreviousClose) ?? numberValue(meta.previousClose),
    open: lastNumber(bars.open), high: lastNumber(bars.high), low: lastNumber(bars.low), volume: lastNumber(bars.volume),
    marketOpen: start !== null && end !== null ? now >= start && now < end : null,
    sourceUpdatedAt: dateValue(meta.regularMarketTime) || (Array.isArray(result.timestamp) ? dateValue(result.timestamp[result.timestamp.length - 1]) : null),
    exchange: textValue(meta.fullExchangeName, 100) || textValue(meta.exchangeName, 100) || null,
    source: 'Yahoo Finance public chart (display only)', sourceCode: 'YAHOO_PUBLIC_CHART',
  });
}

async function yahooSearch(query: string, count = 6): Promise<{ symbol: string; name: string; type: string }[]> {
  const url = new URL('https://query1.finance.yahoo.com/v1/finance/search');
  url.searchParams.set('q', query);
  url.searchParams.set('quotesCount', String(Math.max(1, Math.min(10, count))));
  url.searchParams.set('newsCount', '0');
  const payload = await requestJson(url, { 'User-Agent': 'Mozilla/5.0 VADMarket/1.0' });
  if (!isRecord(payload) || !Array.isArray(payload.quotes)) return [];
  return payload.quotes.filter(isRecord).flatMap((row) => {
    const symbol = textValue(row.symbol, 40);
    if (!symbol || !/^[A-Za-z0-9.^=_-]{1,40}$/.test(symbol)) return [];
    return [{ symbol, name: textValue(row.longname, 180) || textValue(row.shortname, 180) || symbol, type: textValue(row.quoteType, 30).toUpperCase() }];
  });
}

function configuredSymbols(source: Source) {
  return browseSymbols(source).map((item) => ({ symbol: item.symbol, name: item.name }));
}

function commodityTicker(symbol: string): string | null {
  const map: Record<string, string> = {
    'XAU/USD': 'GC=F', 'GOLD': 'GC=F', 'XAG/USD': 'SI=F', 'SILVER': 'SI=F',
    'WTI/USD': 'CL=F', 'OIL': 'CL=F', 'CRUDE OIL': 'CL=F',
    'BRENT/USD': 'BZ=F', 'BRENT': 'BZ=F', 'NATGAS/USD': 'NG=F', 'NATURAL GAS': 'NG=F',
  };
  return map[symbol.trim().toUpperCase()] ?? (/^[A-Z]{1,8}=F$/i.test(symbol.trim()) ? symbol.trim().toUpperCase() : null);
}

function parseForexPair(value: string) {
  const match = value.trim().toUpperCase().match(/^([A-Z]{3})\s*[/_-]\s*([A-Z]{3})$/);
  return match ? { base: match[1], quote: match[2], symbol: match[1] + '/' + match[2] } : null;
}

async function publicFinancialQuotes(source: Source, assetClass: AssetClass, query: string): Promise<AssetQuote[]> {
  if (assetClass === 'FOREX') {
    const catalog = configuredSymbols(source);
    const pair = parseForexPair(query) ?? catalog.map((item) => parseForexPair(item.symbol))
      .find((item) => item && (item.symbol.toLowerCase().includes(query.toLowerCase())
        || query.toLowerCase().includes(item.base.toLowerCase()) || query.toLowerCase().includes(item.quote.toLowerCase())));
    const requested = query.trim() ? (pair ? [pair] : []) : catalog.map((item) => parseForexPair(item.symbol)).filter((item): item is { base: string; quote: string; symbol: string } => Boolean(item)).slice(0, 6);
    const result: AssetQuote[] = [];
    for (const item of requested) {
      try {
        const url = new URL('https://api.frankfurter.dev/v1/latest');
        url.searchParams.set('base', item.base);
        url.searchParams.set('symbols', item.quote);
        const value = await requestJson(url);
        if (!isRecord(value) || !isRecord(value.rates)) continue;
        const rate = numberValue(value.rates[item.quote]);
        if (rate === null) continue;
        result.push(publicQuote({
          id: item.symbol, symbol: item.symbol, name: item.base + ' / ' + item.quote,
          assetClass, quoteCurrency: item.quote, currentPrice: rate,
          sourceUpdatedAt: typeof value.date === 'string' ? dateValue(value.date) : null,
          source: 'Frankfurter / European Central Bank reference rates (display only)', sourceCode: 'FRANKFURTER_ECB',
        }));
      } catch {
        // Unsupported public reference-rate pairs are omitted without blanking other pairs.
      }
    }
    return result;
  }

  if (assetClass === 'ECONOMICS') {
    const rawSeries = source.providerMetadata.featured_series;
    const catalog = Array.isArray(rawSeries) ? rawSeries.filter(isRecord).map((item) => ({
      id: textValue(item.id, 80),
      title: textValue(item.title, 180) || textValue(item.id, 80),
      units: textValue(item.units, 100),
      frequency: textValue(item.frequency, 100),
    })).filter((item) => item.id) : [];
    const selected = (query.trim()
      ? catalog.filter((item) => (item.id + ' ' + item.title + ' ' + item.units).toLowerCase().includes(query.toLowerCase()))
      : catalog).slice(0, 6);
    const results: AssetQuote[] = [];
    for (const series of selected) {
      try {
        const url = new URL('https://fred.stlouisfed.org/graph/fredgraph.csv');
        url.searchParams.set('id', series.id);
        const csv = await requestText(url);
        const observations = csv.trim().split(/\r?\n/).slice(1).reverse().flatMap((line) => {
          const [date, raw] = line.split(',');
          const price = numberValue(raw);
          return date && price !== null ? [{ date, price }] : [];
        });
        const latest = observations[0];
        if (!latest) continue;
        results.push(publicQuote({
          id: series.id, symbol: series.id, name: series.title, assetClass,
          quoteCurrency: series.units || 'index', currentPrice: latest.price,
          sourceUpdatedAt: dateValue(latest.date), exchange: [series.units, series.frequency].filter(Boolean).join(' · ') || null,
          source: 'FRED public chart data (display only)', sourceCode: 'FRED_PUBLIC_CSV',
        }));
      } catch {
        // One delayed or unavailable series should not hide the rest of the list.
      }
    }
    return results;
  }

  let candidates: { symbol: string; name: string; type?: string }[] = [];
  if (!query.trim()) candidates = configuredSymbols(source);
  else if (assetClass === 'COMMODITIES') {
    const all = configuredSymbols(source);
    candidates = all.filter((item) => item.symbol.toLowerCase().includes(query.toLowerCase()) || item.name.toLowerCase().includes(query.toLowerCase()))
      .map((item) => ({ ...item, symbol: commodityTicker(item.symbol) ?? item.symbol }));
    if (!candidates.length) {
      const knownTicker = commodityTicker(query);
      if (knownTicker) candidates = [{ symbol: knownTicker, name: query }];
      else candidates = (await yahooSearch(query, 8)).filter((item) => item.type === 'FUTURE').slice(0, 4);
    }
  } else {
    try {
      candidates = (await yahooSearch(query, 8)).filter((item) => ['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX'].includes(item.type)).slice(0, 5);
    } catch {
      candidates = [];
    }
    if (!candidates.length && /^[A-Za-z0-9.^=_-]{1,40}$/.test(query.trim())) {
      candidates = [{ symbol: query.trim().toUpperCase(), name: query.trim().toUpperCase() }];
    }
  }

  const results: AssetQuote[] = [];
  for (const candidate of candidates.slice(0, Math.max(1, Math.min(6, source.defaultPageSize)))) {
    const displaySymbol = assetClass === 'COMMODITIES'
      ? (configuredSymbols(source).find((item) => commodityTicker(item.symbol) === candidate.symbol)?.symbol ?? candidate.symbol)
      : candidate.symbol;
    try {
      const quote = await yahooChart(candidate.symbol, candidate.name, assetClass, source.quoteCurrency);
      if (quote) results.push({ ...quote, id: displaySymbol, symbol: displaySymbol, quoteCurrency: source.quoteCurrency });
    } catch {
      // An unsupported ticker must not blank the rest of the browsing catalogue.
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let stalePayload: JsonRecord | null = null;
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
    const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))?.trim();
    if (!supabaseUrl || !serviceKey) return json({ error: 'Financial market data service is not configured.' }, 503);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let body: JsonRecord;
    try {
      const value = await req.json();
      if (!isRecord(value)) return json({ error: 'Invalid request body' }, 400);
      body = value;
    } catch { return json({ error: 'Invalid JSON' }, 400); }

    const assetClass = textValue(body.assetClass, 40).toUpperCase() as AssetClass;
    if (!['STOCKS', 'COMMODITIES', 'FOREX', 'ECONOMICS'].includes(assetClass)) {
      return json({ error: 'Choose Stocks, Commodities, Forex or Economic Indicators.' }, 400);
    }
    const query = textValue(body.query, 120);
    if (query.length === 1) return json({
      ok: true, assetClass, query, items: [],
      message: 'Enter at least two characters to search. Leave the search blank to browse the provider-configured asset watchlist.',
    });

    const { data: sourceRow, error: sourceError } = await admin.rpc('internal_financial_market_data_source_runtime', {
      p_asset_class: assetClass,
    });
    if (sourceError) return json({ error: 'Financial market-data configuration is unavailable.' }, 503);
    if (!isRecord(sourceRow)) return json({ error: 'No provider is configured for this financial asset class. Configure a source in Admin.' }, 503);
    const source = sourceRow as unknown as Source;
    if (source.status !== 'ACTIVE') return json({
      error: 'The ' + assetClass.toLowerCase() + ' quote feed is not enabled yet.',
      code: 'FINANCIAL_SOURCE_DISABLED',
      message: 'An administrator must enable a provider and configure its secret in the secure Edge Function environment.',
    }, 503);
    const apiKey = configuredCredential(source);
    const usePublicFallback = !apiKey && ['STOCKS', 'COMMODITIES', 'FOREX', 'ECONOMICS'].includes(assetClass);
    if (!apiKey && !usePublicFallback) return json({
      error: 'The configured provider credential is missing.',
      code: 'FINANCIAL_SOURCE_CREDENTIAL_MISSING',
      message: 'Add ' + textValue(source.secretReference, 100) + ' to the secure Edge Function secrets before enabling this feed.',
    }, 503);

    const cacheKey = await hash([source.code, assetClass, query.toLowerCase()].join('|'));
    const { data: cached, error: cacheError } = await admin.rpc('internal_get_financial_market_data_cache', { p_request_key: cacheKey });
    let staleItems: AssetQuote[] | null = null;
    if (!cacheError && isRecord(cached) && isRecord(cached.payload)) {
      const payload = cached.payload as JsonRecord;
      const items = Array.isArray(payload.items) ? payload.items as AssetQuote[] : [];
      const expiresAt = Date.parse(String(cached.expiresAt ?? ''));
      const staleUntil = Date.parse(String(cached.staleUntil ?? ''));
      if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
        return json({ ...payload, cached: true }, 200, Math.max(15, Math.min(3600, source.cacheSeconds)));
      }
      if (Number.isFinite(staleUntil) && staleUntil > Date.now()) staleItems = items;
    }

    const requestCost = source.adapterCode === 'FRED_SERIES'
      ? (query.length === 0 ? Math.max(1, Math.min(8, Array.isArray(source.providerMetadata.featured_series) ? source.providerMetadata.featured_series.length : 4)) : 4)
      : (query.length === 0 ? Math.max(1, Math.min(8, browseSymbols(source).length)) : 5);
    const { data: reserved, error: reserveError } = await admin.rpc('internal_reserve_financial_market_request', {
      p_source_code: source.code, p_request_cost: requestCost,
    });
    if (reserveError || reserved !== true) {
      if (staleItems) return json({
        ok: true, assetClass, source: source.name, sourceCode: source.code, query,
        quoteCurrency: source.quoteCurrency, fetchedAt: cached?.fetchedAt ?? new Date().toISOString(),
        items: staleItems, stale: true, cached: true,
        message: 'Provider request budget reached. Showing cached data.',
      }, 200, 15);
      return json({ error: 'The configured financial-data request budget has been reached. Try cached data later.' }, 429);
    }

    try {
      let items: AssetQuote[];
      if (usePublicFallback) items = await publicFinancialQuotes(source, assetClass, query);
      else if (source.adapterCode === 'TWELVE_DATA_QUOTE') {
        items = query.length === 0
          ? await twelveDataBrowse(source, apiKey)
          : await twelveDataQuotes(source, query, apiKey);
      } else if (source.adapterCode === 'FRED_SERIES' && assetClass === 'ECONOMICS') {
        items = await fredQuotes(source, query, apiKey);
      } else {
        throw new Error('The configured financial-data adapter does not support this asset class.');
      }
      const now = new Date();
      const fallbackName = usePublicFallback
        ? (assetClass === 'FOREX' ? 'Frankfurter / European Central Bank reference rates (display only)'
          : assetClass === 'ECONOMICS' ? 'FRED public chart data (display only)'
            : 'Yahoo Finance public chart (display only)')
        : null;
      const fallbackCode = usePublicFallback
        ? (assetClass === 'FOREX' ? 'FRANKFURTER_ECB' : assetClass === 'ECONOMICS' ? 'FRED_PUBLIC_CSV' : 'YAHOO_PUBLIC_CHART')
        : null;
      const payload = {
        ok: true, source: fallbackName ?? source.name, sourceCode: fallbackCode ?? source.code,
        dataPurpose: 'DISPLAY_ONLY', assetClass, quoteCurrency: source.quoteCurrency,
        query, fetchedAt: now.toISOString(), cacheSeconds: source.cacheSeconds,
        stale: false, cached: false, items,
      };
      const { error: writeError } = await admin.rpc('internal_upsert_financial_market_data_cache', {
        p_request_key: cacheKey, p_source_code: source.code, p_payload: payload,
        p_ttl_seconds: source.cacheSeconds, p_stale_seconds: 21600,
      });
      if (writeError) console.warn('Financial market-data cache write failed:', writeError.code);
      return json(payload, 200, Math.max(15, Math.min(3600, source.cacheSeconds)));
    } catch (error) {
      if (staleItems) return json({
        ok: true, source: source.name, sourceCode: source.code, assetClass, query,
        quoteCurrency: source.quoteCurrency, fetchedAt: cached?.fetchedAt ?? new Date().toISOString(),
        items: staleItems, stale: true, cached: true,
        message: 'The live source could not refresh. Showing cached data.',
      }, 200, 15);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Financial market data is unavailable.';
    return json({ error: message }, /rate limit|request budget/i.test(message) ? 429 : 502);
  }
});
