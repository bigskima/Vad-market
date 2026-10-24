import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
type JsonRecord = Record<string, unknown>;
const STOCKS_BROWSE_FALLBACK = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'META', name: 'Meta Platforms' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'AVGO', name: 'Broadcom' },
];
const COMMODITIES_BROWSE_FALLBACK = [
  { symbol: 'GC=F', name: 'Gold Futures' },
  { symbol: 'SI=F', name: 'Silver Futures' },
  { symbol: 'CL=F', name: 'WTI Crude Oil' },
  { symbol: 'BZ=F', name: 'Brent Crude Oil' },
  { symbol: 'NG=F', name: 'Natural Gas Futures' },
  { symbol: 'HG=F', name: 'Copper Futures' },
  { symbol: 'ZC=F', name: 'Corn Futures' },
  { symbol: 'ZS=F', name: 'Soybean Futures' },
  { symbol: 'ZW=F', name: 'Wheat Futures' },
  { symbol: 'KC=F', name: 'Coffee Futures' },
  { symbol: 'SB=F', name: 'Sugar Futures' },
  { symbol: 'PL=F', name: 'Platinum Futures' },
];
const FX_BROWSE_PAIRS = [
  ['EUR/USD', 'Euro / US Dollar'], ['GBP/USD', 'British Pound / US Dollar'],
  ['USD/JPY', 'US Dollar / Japanese Yen'], ['USD/CHF', 'US Dollar / Swiss Franc'],
  ['USD/CAD', 'US Dollar / Canadian Dollar'], ['AUD/USD', 'Australian Dollar / US Dollar'],
  ['NZD/USD', 'New Zealand Dollar / US Dollar'], ['USD/CNY', 'US Dollar / Chinese Yuan'],
  ['USD/INR', 'US Dollar / Indian Rupee'], ['USD/NGN', 'US Dollar / Nigerian Naira'],
  ['USD/SGD', 'US Dollar / Singapore Dollar'], ['USD/HKD', 'US Dollar / Hong Kong Dollar'],
  ['USD/ZAR', 'US Dollar / South African Rand'], ['USD/BRL', 'US Dollar / Brazilian Real'],
  ['USD/MXN', 'US Dollar / Mexican Peso'], ['USD/KRW', 'US Dollar / South Korean Won'],
  ['USD/THB', 'US Dollar / Thai Baht'], ['USD/TRY', 'US Dollar / Turkish Lira'],
  ['USD/AED', 'US Dollar / UAE Dirham'], ['USD/SAR', 'US Dollar / Saudi Riyal'],
  ['USD/KES', 'US Dollar / Kenyan Shilling'], ['USD/GHS', 'US Dollar / Ghanaian Cedi'],
  ['USD/EGP', 'US Dollar / Egyptian Pound'], ['USD/PKR', 'US Dollar / Pakistani Rupee'],
] as const;
const FX_CURRENCY_NAMES: Record<string, string> = {
  EUR: 'Euro', USD: 'US Dollar', GBP: 'British Pound', JPY: 'Japanese Yen',
  CHF: 'Swiss Franc', CAD: 'Canadian Dollar', AUD: 'Australian Dollar',
  NZD: 'New Zealand Dollar', CNY: 'Chinese Yuan', INR: 'Indian Rupee',
  NGN: 'Nigerian Naira', SGD: 'Singapore Dollar', HKD: 'Hong Kong Dollar',
  ZAR: 'South African Rand', BRL: 'Brazilian Real', MXN: 'Mexican Peso',
  KRW: 'South Korean Won', THB: 'Thai Baht', TRY: 'Turkish Lira',
  AED: 'UAE Dirham', SAR: 'Saudi Riyal', KES: 'Kenyan Shilling',
  GHS: 'Ghanaian Cedi', EGP: 'Egyptian Pound', PKR: 'Pakistani Rupee',
};
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
  imageUrl?: string | null;
  sourceUrl?: string | null;
  secondaryImageUrl?: string | null;
  visualKind?: 'logo' | 'flag-pair' | 'series-chart' | 'symbol';
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

async function requestText(url: URL, approvedHost: string, approvedPrefix: string): Promise<string> {
  if (url.protocol !== 'https:' || url.hostname !== approvedHost || !url.pathname.startsWith(approvedPrefix)) {
    throw new Error('The requested public data URL is not approved.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'error',
      headers: { Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.5', 'User-Agent': 'VAD-Financial-Data/1.0' },
    });
    if (!response.ok) throw new Error('The public data source returned HTTP ' + response.status + '.');
    const raw = await response.text();
    if (raw.length > 2_000_000 || !raw.includes(',')) throw new Error('The public data source returned an invalid data file.');
    return raw;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The public data request timed out.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function definitionsForQuery(source: Source, query: string, limit = 8) {
  const definitions = browseSymbols(source);
  if (!query.trim()) return definitions.slice(0, limit);
  const normalized = query.trim().toLowerCase();
  const matched = definitions.filter((item) => item.symbol.toLowerCase().includes(normalized) || item.name.toLowerCase().includes(normalized));
  if (matched.length) return matched.slice(0, limit);
  return [];
}

async function yahooChartQuote(symbol: string, name: string, source: Source): Promise<AssetQuote | null> {
  if (!/^[A-Z0-9^=._-]{1,20}$/.test(symbol)) return null;
  const url = new URL('/v8/finance/chart/' + encodeURIComponent(symbol), 'https://query1.finance.yahoo.com');
  url.searchParams.set('range', '5d');
  url.searchParams.set('interval', '1d');
  url.searchParams.set('events', 'div,splits');
  const payload = await requestJson(url);
  if (!isRecord(payload) || !isRecord(payload.chart)) throw new Error('The public chart source returned invalid data.');
  if (payload.chart.error) throw new Error('No current public chart data is available for ' + symbol + '.');
  const rows = Array.isArray(payload.chart.result) ? payload.chart.result.filter(isRecord) : [];
  const row = rows[0];
  if (!row) return null;
  const meta = isRecord(row.meta) ? row.meta : {};
  const indicators = isRecord(row.indicators) ? row.indicators : {};
  const quoteRows = Array.isArray(indicators.quote) ? indicators.quote.filter(isRecord) : [];
  const quote = quoteRows[0] ?? {};
  const timestamps = Array.isArray(row.timestamp) ? row.timestamp : [];
  const closes = Array.isArray(quote.close) ? quote.close : [];
  let lastIndex = -1;
  for (let index = Math.min(timestamps.length, closes.length) - 1; index >= 0; index -= 1) {
    if (numberValue(timestamps[index]) !== null && numberValue(closes[index]) !== null) {
      lastIndex = index;
      break;
    }
  }
  const close = lastIndex >= 0 ? numberValue(closes[lastIndex]) : null;
  const currentPrice = numberValue(meta.regularMarketPrice) ?? close;
  if (currentPrice === null) return null;
  const previousClose = numberValue(meta.chartPreviousClose) ?? numberValue(meta.previousClose)
    ?? (lastIndex > 0 ? numberValue(closes[lastIndex - 1]) : null);
  const pctChange = previousClose && previousClose !== 0 ? ((currentPrice - previousClose) / previousClose) * 100 : null;
  const values = (key: string) => Array.isArray(quote[key]) && lastIndex >= 0 ? numberValue((quote[key] as unknown[])[lastIndex]) : null;
  const timestamp = numberValue(meta.regularMarketTime) ?? (lastIndex >= 0 ? numberValue(timestamps[lastIndex]) : null);
  return {
    id: symbol,
    symbol,
    name: name || textValue(meta.longName, 180) || textValue(meta.shortName, 180) || symbol,
    assetClass: source.assetClass,
    quoteCurrency: textValue(meta.currency, 12) || (source.assetClass === 'FOREX' ? 'USD' : source.quoteCurrency),
    currentPrice,
    change24hPercent: pctChange,
    open: values('open'),
    high: values('high'),
    low: values('low'),
    volume: values('volume'),
    marketOpen: null,
    sourceUpdatedAt: dateValue(timestamp),
    exchange: (textValue(meta.exchangeName, 80) || textValue(meta.fullExchangeName, 80) || 'Public chart') + ' · delayed/unofficial reference',
    source: 'Yahoo Finance public chart · delayed display data',
    sourceCode: 'YAHOO_PUBLIC_CHART',
  };
}

function yahooCommodityTicker(symbol: string) {
  const normalized = symbol.toUpperCase().replace(/\s+/g, '');
  const aliases: Record<string, string> = {
    'GOLD': 'GC=F', 'XAU/USD': 'GC=F', 'XAUUSD': 'GC=F',
    'SILVER': 'SI=F', 'XAG/USD': 'SI=F', 'XAGUSD': 'SI=F',
    'WTI/USD': 'CL=F', 'WTI': 'CL=F', 'CL=F': 'CL=F',
    'BRENT/USD': 'BZ=F', 'BRENT': 'BZ=F', 'BZ=F': 'BZ=F',
    'NATGAS/USD': 'NG=F', 'NATURAL GAS': 'NG=F', 'NATGAS': 'NG=F', 'NG=F': 'NG=F',
    'COPPER': 'HG=F', 'HG=F': 'HG=F', 'CORN': 'ZC=F', 'ZC=F': 'ZC=F',
    'SOYBEANS': 'ZS=F', 'ZS=F': 'ZS=F', 'WHEAT': 'ZW=F', 'ZW=F': 'ZW=F',
    'COFFEE': 'KC=F', 'KC=F': 'KC=F',
    'SUGAR': 'SB=F', 'SB=F': 'SB=F', 'PLATINUM': 'PL=F', 'PL=F': 'PL=F',
    'PALLADIUM': 'PA=F', 'PA=F': 'PA=F',
  };
  return aliases[normalized] ?? (/^[A-Z0-9^=._-]{1,20}$/.test(normalized) ? normalized : null);
}

async function yahooSymbolSearch(query: string): Promise<Array<{ symbol: string; name: string }>> {
  const search = query.trim();
  if (!search) return [];
  const url = new URL('/v1/finance/search', 'https://query1.finance.yahoo.com');
  url.searchParams.set('q', search.slice(0, 100));
  url.searchParams.set('quotesCount', '10');
  url.searchParams.set('newsCount', '0');
  url.searchParams.set('enableFuzzyQuery', 'true');
  const payload = await requestJson(url);
  if (!isRecord(payload)) return [];
  const rows = Array.isArray(payload.quotes) ? payload.quotes.filter(isRecord) : [];
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const symbol = textValue(row.symbol, 30).toUpperCase();
    const quoteType = textValue(row.quoteType, 30).toUpperCase();
    const name = textValue(row.longname ?? row.shortname ?? row.name, 180) || symbol;
    if (!symbol || !/^[A-Z0-9^=._-]{1,20}$/.test(symbol) || !['EQUITY', 'ETF', 'INDEX'].includes(quoteType) || seen.has(symbol)) return [];
    seen.add(symbol);
    return [{ symbol, name }];
  }).slice(0, 8);
}

async function yahooMostActiveSymbols(limit = 16): Promise<Array<{ symbol: string; name: string }>> {
  const url = new URL('/v1/finance/screener/predefined/saved', 'https://query1.finance.yahoo.com');
  url.searchParams.set('formatted', 'false');
  url.searchParams.set('lang', 'en-US');
  url.searchParams.set('region', 'US');
  url.searchParams.set('scrIds', 'most_actives');
  url.searchParams.set('count', String(Math.max(1, Math.min(20, limit))));
  url.searchParams.set('start', '0');
  url.searchParams.set('corsDomain', 'finance.yahoo.com');
  const payload = await requestJson(url);
  if (!isRecord(payload) || !isRecord(payload.finance)) return [];
  const results = Array.isArray(payload.finance.result) ? payload.finance.result.filter(isRecord) : [];
  const first = results[0];
  const rows = first && Array.isArray(first.quotes) ? first.quotes.filter(isRecord) : [];
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const symbol = textValue(row.symbol, 30).toUpperCase();
    const quoteType = textValue(row.quoteType, 30).toUpperCase();
    const name = textValue(row.longName ?? row.shortName ?? row.displayName, 180) || symbol;
    if (!symbol || !/^[A-Z0-9^=._-]{1,20}$/.test(symbol)
      || !['EQUITY', 'ETF', 'INDEX'].includes(quoteType) || seen.has(symbol)) return [];
    seen.add(symbol);
    return [{ symbol, name }];
  }).slice(0, limit);
}

async function freeYahooQuotes(source: Source, query: string): Promise<AssetQuote[]> {
  const browseLimit = source.assetClass === 'STOCKS' ? 8 : 5;
  let definitions = definitionsForQuery(source, query, browseLimit);
  if (source.assetClass === 'STOCKS' && !query.trim()) {
    let liveSymbols: Array<{ symbol: string; name: string }> = [];
    try {
      liveSymbols = await yahooMostActiveSymbols(16);
    } catch (error) {
      console.warn('Yahoo most-active stock catalogue unavailable: ' + (error instanceof Error ? error.message : 'request failed'));
    }
    if (liveSymbols.length) {
      definitions = liveSymbols;
    } else {
      const seen = new Set(definitions.map((item) => item.symbol.toUpperCase()));
      definitions = [...definitions, ...STOCKS_BROWSE_FALLBACK.filter((item) => !seen.has(item.symbol))]
        .slice(0, 8);
    }
  }
  if (source.assetClass === 'STOCKS' && query.trim()) {
    try {
      const searched = await yahooSymbolSearch(query);
      if (searched.length) definitions = searched;
    } catch (error) {
      console.warn('Yahoo symbol search unavailable for ' + query + ': ' + (error instanceof Error ? error.message : 'request failed'));
    }
  }
  if (source.assetClass === 'COMMODITIES') {
    if (query.trim() && definitions.length === 0) {
      const ticker = yahooCommodityTicker(query);
      if (ticker) definitions = [{ symbol: ticker, name: query.trim() }];
    }
    if (!query.trim()) definitions = COMMODITIES_BROWSE_FALLBACK;
  } else if (source.assetClass === 'STOCKS' && query.trim() && definitions.length === 0 && /^[A-Z0-9^=._-]{1,10}$/i.test(query.trim())) {
    definitions = [{ symbol: query.trim().toUpperCase(), name: query.trim().toUpperCase() }];
  }
  const results: AssetQuote[] = [];
  // Fetch in small batches so a 16-symbol stock browse remains within the
  // Edge Function time budget even when one public chart endpoint is slow.
  for (let offset = 0; offset < definitions.length; offset += 4) {
    const batch = definitions.slice(offset, offset + 4);
    const batchResults = await Promise.all(batch.map(async (definition): Promise<AssetQuote | null> => {
      const ticker = source.assetClass === 'COMMODITIES'
        ? yahooCommodityTicker(definition.symbol)
        : definition.symbol.toUpperCase();
      if (!ticker) return null;
      try {
        const quote = await yahooChartQuote(ticker, definition.name, source);
        if (!quote) return null;
        return {
          ...quote,
          id: definition.symbol,
          symbol: definition.symbol,
          name: definition.name || quote.name,
          quoteCurrency: source.assetClass === 'STOCKS'
            ? quote.quoteCurrency || source.quoteCurrency || 'USD'
            : source.quoteCurrency || 'USD',
          exchange: source.assetClass === 'COMMODITIES'
            ? 'Futures contract · delayed, display-only reference'
            : quote.exchange,
        };
      } catch (error) {
        console.warn('Free Yahoo display quote unavailable for ' + ticker + ': ' + (error instanceof Error ? error.message : 'request failed'));
        return null;
      }
    }));
    results.push(...batchResults.filter((item): item is AssetQuote => item !== null));
  }
  return results;
}

async function freeForexQuotes(source: Source, query: string): Promise<AssetQuote[]> {
  const ratePayload = await requestJson(new URL('https://open.er-api.com/v6/latest/USD'));
  if (!isRecord(ratePayload) || ratePayload.result !== 'success' || !isRecord(ratePayload.rates)) {
    throw new Error('The public daily FX reference feed returned an invalid response.');
  }
  const rates = ratePayload.rates as Record<string, unknown>;
  const updatedAt = dateValue(ratePayload.time_last_update_utc ?? ratePayload.time_last_update_unix);
  const rateFor = (base: string, quote: string): number | null => {
    if (base === quote) return 1;
    const baseRate = base === 'USD' ? 1 : numberValue(rates[base]);
    const quoteRate = quote === 'USD' ? 1 : numberValue(rates[quote]);
    if (baseRate === null || quoteRate === null || baseRate === 0) return null;
    return quoteRate / baseRate;
  };
  const normalizePair = (raw: string): [string, string] | null => {
    const value = raw.trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (value.length !== 6) return null;
    const base = value.slice(0, 3);
    const quote = value.slice(3, 6);
    if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote)) return null;
    return [base, quote];
  };
  const makeQuote = (base: string, quote: string, displayName?: string): AssetQuote | null => {
    const rate = rateFor(base, quote);
    if (rate === null || !Number.isFinite(rate) || rate <= 0) return null;
    return {
      id: base + '/' + quote,
      symbol: base + '/' + quote,
      name: displayName || (FX_CURRENCY_NAMES[base] ?? base) + ' / ' + (FX_CURRENCY_NAMES[quote] ?? quote),
      assetClass: 'FOREX',
      quoteCurrency: quote,
      currentPrice: rate,
      change24hPercent: null,
      open: null,
      high: null,
      low: null,
      volume: null,
      marketOpen: false,
      sourceUpdatedAt: updatedAt,
      exchange: 'Daily reference rate · not an executable trading quote',
      source: 'ExchangeRate-API Open Access reference rates',
      sourceCode: 'EXCHANGE_RATE_API_OPEN',
      sourceUrl: 'https://www.exchangerate-api.com/',
    };
  };

  const normalized = query.trim().toUpperCase();
  const directPair = normalizePair(normalized);
  if (directPair) {
    const [base, quote] = directPair;
    const item = makeQuote(base, quote);
    return item ? [item] : [];
  }
  if (normalized) {
    const compactQuery = normalized.replace(/[^A-Z]/g, '');
    const exactCurrency = /^[A-Z]{3}$/.test(compactQuery) ? compactQuery : '';
    const matchingPairs = FX_BROWSE_PAIRS.filter(([symbol, name]) =>
      symbol.replace('/', '').includes(compactQuery)
      || symbol.toLowerCase().includes(normalized.toLowerCase())
      || name.toLowerCase().includes(normalized.toLowerCase())
      || (exactCurrency && symbol.split('/').includes(exactCurrency)),
    );
    if (matchingPairs.length) {
      return matchingPairs.map(([symbol, name]) => {
        const [base, quote] = symbol.split('/');
        return makeQuote(base, quote, name);
      }).filter((item): item is AssetQuote => item !== null).slice(0, 20);
    }
    return [];
  }
  return FX_BROWSE_PAIRS.map(([symbol, name]) => {
    const [base, quote] = symbol.split('/');
    return makeQuote(base, quote, name);
  }).filter((item): item is AssetQuote => item !== null);
}

const FALLBACK_FRED_SERIES: JsonRecord[] = [
  { id: 'CPIAUCSL', title: 'Consumer Price Index (inflation)', units: 'Index 1982-1984=100', frequency: 'Monthly' },
  { id: 'CPILFESL', title: 'Core Consumer Price Index', units: 'Index 1982-1984=100', frequency: 'Monthly' },
  { id: 'PCEPI', title: 'Personal Consumption Expenditures Price Index', units: 'Index 2017=100', frequency: 'Monthly' },
  { id: 'UNRATE', title: 'Unemployment Rate', units: 'Percent', frequency: 'Monthly' },
  { id: 'PAYEMS', title: 'Total Nonfarm Employment', units: 'Thousands of persons', frequency: 'Monthly' },
  { id: 'GDP', title: 'Gross Domestic Product', units: 'Billions of Dollars', frequency: 'Quarterly' },
  { id: 'GDPC1', title: 'Real Gross Domestic Product', units: 'Billions of Chained 2017 Dollars', frequency: 'Quarterly' },
  { id: 'FEDFUNDS', title: 'Federal Funds Effective Rate', units: 'Percent', frequency: 'Monthly' },
  { id: 'DGS10', title: '10-Year Treasury Yield', units: 'Percent', frequency: 'Daily' },
  { id: 'DFF', title: 'Effective Federal Funds Rate', units: 'Percent', frequency: 'Daily' },
  { id: 'M2SL', title: 'M2 Money Supply', units: 'Billions of Dollars', frequency: 'Monthly' },
  { id: 'RSAFS', title: 'Advance Retail Sales', units: 'Millions of Dollars', frequency: 'Monthly' },
  { id: 'INDPRO', title: 'Industrial Production Index', units: 'Index 2017=100', frequency: 'Monthly' },
  { id: 'HOUST', title: 'Housing Starts', units: 'Thousands of Units', frequency: 'Monthly' },
  { id: 'PERMIT', title: 'Building Permits', units: 'Thousands of Units', frequency: 'Monthly' },
  { id: 'UMCSENT', title: 'Consumer Sentiment', units: 'Index 1966:Q1=100', frequency: 'Monthly' },
  { id: 'BOPGSTB', title: 'Trade Balance: Goods and Services', units: 'Millions of Dollars', frequency: 'Monthly' },
  { id: 'DEXUSEU', title: 'US Dollar to Euro Exchange Rate', units: 'USD per EUR', frequency: 'Daily' },
  { id: 'DEXJPUS', title: 'Japanese Yen to US Dollar Exchange Rate', units: 'JPY per USD', frequency: 'Daily' },
  { id: 'WALCL', title: 'Federal Reserve Total Assets', units: 'Millions of Dollars', frequency: 'Weekly' },
];
function featuredFredSeries(source: Source): JsonRecord[] {
  const configured = source.providerMetadata.featured_series;
  const combined = [
    ...(Array.isArray(configured) ? configured.filter(isRecord) : []),
    ...FALLBACK_FRED_SERIES,
  ];
  const seen = new Set<string>();
  return combined.map((item) => ({
    id: textValue(item.id ?? item.series_id ?? item.seriesId ?? item.symbol, 40).toUpperCase(),
    title: textValue(item.title ?? item.name ?? item.label, 180),
    units: textValue(item.units, 80),
    frequency: textValue(item.frequency, 80),
  })).filter((item) => {
    const id = textValue(item.id, 40);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
async function freeFredCsvQuote(source: Source, series: JsonRecord): Promise<AssetQuote | null> {
  const id = textValue(series.id, 40).toUpperCase();
  if (!/^[A-Z0-9_-]{1,40}$/.test(id)) return null;
  const url = new URL('/graph/fredgraph.csv', 'https://fred.stlouisfed.org');
  url.searchParams.set('id', id);
  const raw = await requestText(url, 'fred.stlouisfed.org', '/graph/fredgraph.csv');
  const csvLines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (csvLines.length < 2 || !/^observation_date,?/i.test(csvLines[0])) {
    throw new Error('FRED returned an invalid public CSV export for ' + id + '.');
  }
  const observations = csvLines.slice(1).map((line) => {
    const [date, value] = line.split(',');
    return { date: textValue(date, 30), value: numberValue(value) };
  }).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.value !== null);
  const last = observations[observations.length - 1];
  if (!last || last.value === null) return null;
  const title = textValue(series.title, 180) || id;
  return {
    id, symbol: id, name: title, assetClass: 'ECONOMICS', quoteCurrency: 'index',
    currentPrice: last.value, change24hPercent: null, open: null, high: null, low: null, volume: null,
    marketOpen: false, sourceUpdatedAt: last.date,
    exchange: [textValue(series.units, 80), textValue(series.frequency, 80), 'official series observation'].filter(Boolean).join(' · '),
    source: 'FRED public CSV export', sourceCode: 'FRED_PUBLIC_CSV',
  };
}

async function freeFredQuotes(source: Source, query: string): Promise<AssetQuote[]> {
  const featured = featuredFredSeries(source);
  let definitions: JsonRecord[];
  if (!query.trim()) {
    definitions = featured.slice(0, 20);
  } else {
    definitions = featured.filter((item) => textValue(item.id).toLowerCase().includes(query.toLowerCase())
      || textValue(item.title).toLowerCase().includes(query.toLowerCase()));
    if (!definitions.length && /^[A-Z0-9_-]{1,40}$/i.test(query.trim())) {
      definitions = [{ id: query.trim().toUpperCase(), title: query.trim().toUpperCase() }];
    }
    definitions = definitions.slice(0, 8);
  }
  const results: AssetQuote[] = [];
  for (let offset = 0; offset < definitions.length; offset += 4) {
    const batch = definitions.slice(offset, offset + 4);
    const batchResults = await Promise.all(batch.map(async (series): Promise<AssetQuote | null> => {
      try {
        return await freeFredCsvQuote(source, series);
      } catch (error) {
        console.warn('Free FRED public CSV unavailable for ' + textValue(series.id) + ': ' + (error instanceof Error ? error.message : 'request failed'));
        return null;
      }
    }));
    results.push(...batchResults.filter((item): item is AssetQuote => item !== null));
  }
  return results;
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
    rows = featuredFredSeries(source).slice(0, 20);
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
  // Keep a broad default economy catalogue without serially waiting on every
  // individual observation request.
  for (let offset = 0; offset < rows.length; offset += 4) {
    const batch = rows.slice(offset, offset + 4);
    const batchItems = await Promise.all(batch.map(async (row): Promise<AssetQuote | null> => {
      const id = textValue(row.id, 80);
      if (!id) return null;
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
      return {
        id, symbol: id, name: textValue(row.title, 180) || id,
        assetClass: 'ECONOMICS', quoteCurrency: 'index',
        currentPrice: numberValue(latest.value), change24hPercent: null,
        open: null, high: null, low: null, volume: null, marketOpen: null,
        sourceUpdatedAt: dateValue(latest.date),
        exchange: [textValue(row.units, 80), textValue(row.frequency, 100)].filter(Boolean).join(' · ') || null,
        source: source.name, sourceCode: source.code,
      };
    }));
    items.push(...batchItems.filter((item): item is AssetQuote => item !== null));
  }
  return items;
}

function addVisualMetadata(item: AssetQuote): AssetQuote {
  const result: AssetQuote = { ...item, imageUrl: null, secondaryImageUrl: null, visualKind: 'symbol' };
  if (item.assetClass === 'STOCKS') {
    const ticker = item.symbol.toUpperCase();
    if (/^[A-Z0-9^=._-]{1,20}$/.test(ticker)) {
      result.imageUrl = 'https://img.anylogo.dev/ticker/' + encodeURIComponent(ticker) + '?size=64&variant=icon';
      result.visualKind = 'logo';
    }
  } else if (item.assetClass === 'FOREX') {
    const parts = item.symbol.toUpperCase().replace(/[^A-Z/]/g, '').split('/');
    const currencyCountries: Record<string, string> = {
      USD:'us', EUR:'eu', GBP:'gb', NGN:'ng', JPY:'jp', AUD:'au', CAD:'ca', CHF:'ch',
      NZD:'nz', CNY:'cn', ZAR:'za', INR:'in', BRL:'br', MXN:'mx', SEK:'se', NOK:'no',
      SGD:'sg', HKD:'hk', AED:'ae', SAR:'sa', TRY:'tr', KRW:'kr', RUB:'ru', PLN:'pl',
      DKK:'dk', THB:'th', IDR:'id', MYR:'my', PHP:'ph', PKR:'pk', BDT:'bd', EGP:'eg',
      KES:'ke', GHS:'gh',
    };
    if (parts.length === 2 && parts.every((currency) => /^[A-Z]{3}$/.test(currency))) {
      const base = currencyCountries[parts[0]];
      const quote = currencyCountries[parts[1]];
      if (base) result.imageUrl = 'https://flagcdn.com/w80/' + base + '.png';
      if (quote) result.secondaryImageUrl = 'https://flagcdn.com/w80/' + quote + '.png';
      result.visualKind = 'flag-pair';
    }
  } else if (item.assetClass === 'ECONOMICS' && /^[A-Z0-9_-]{1,40}$/.test(item.symbol)) {
    const chartUrl = new URL('https://fred.stlouisfed.org/graph/fredgraph.png');
    chartUrl.searchParams.set('id', item.symbol.toUpperCase());
    result.imageUrl = chartUrl.toString();
    result.visualKind = 'series-chart';
  }
  return result;
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
    // Prefer governed free display fallbacks when an optional paid-provider
    // credential is absent. These values never feed Oracle resolution or trading.
    const useFreeFallback = !apiKey;
    const cacheKey = await hash([source.code, assetClass, query.toLowerCase()].join('|'));
    const { data: cached, error: cacheError } = await admin.rpc('internal_get_financial_market_data_cache', { p_request_key: cacheKey });
    let staleItems: AssetQuote[] | null = null;
    if (!cacheError && isRecord(cached) && isRecord(cached.payload)) {
      const payload = cached.payload as JsonRecord;
      const items = Array.isArray(payload.items) ? payload.items as AssetQuote[] : [];
      const expiresAt = Date.parse(String(cached.expiresAt ?? ''));
      const staleUntil = Date.parse(String(cached.staleUntil ?? ''));
      if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
        return json({
          ...payload,
          items: items.map(addVisualMetadata),
          cached: true,
        }, 200, Math.max(15, Math.min(3600, source.cacheSeconds)));
      }
      if (Number.isFinite(staleUntil) && staleUntil > Date.now()) staleItems = items.map(addVisualMetadata);
    }

    const requestCost = useFreeFallback && assetClass === 'STOCKS'
      ? (query.length === 0 ? 17 : 9)
      : useFreeFallback && assetClass === 'COMMODITIES'
        ? (query.length === 0 ? 13 : 5)
        : useFreeFallback && assetClass === 'ECONOMICS'
          ? (query.length === 0 ? 20 : 8)
          : source.adapterCode === 'FRED_SERIES'
            ? (query.length === 0 ? 20 : 4)
            : (query.length === 0 ? Math.max(1, Math.min(8, browseSymbols(source).length)) : 5);
    if (useFreeFallback && !['STOCKS', 'COMMODITIES', 'FOREX', 'ECONOMICS'].includes(assetClass)) {
      return json({
        error: 'The configured provider credential is missing.',
        code: 'FINANCIAL_SOURCE_CREDENTIAL_MISSING',
        message: 'Add ' + textValue(source.secretReference, 100) + ' to secure Edge Function secrets or choose a supported free display source.',
      }, 503);
    }
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
      if (useFreeFallback) {
        if (assetClass === 'FOREX') items = await freeForexQuotes(source, query);
        else if (assetClass === 'ECONOMICS') items = await freeFredQuotes(source, query);
        else items = await freeYahooQuotes(source, query);
        if (!items.length) {
          throw new Error(assetClass === 'FOREX'
            ? 'No matching public daily FX reference rates were returned. Search by a currency pair such as EUR/USD or USD/NGN.'
            : assetClass === 'ECONOMICS'
              ? 'The official public series is temporarily unavailable. Try a configured series such as GDP, CPIAUCSL, UNRATE, FEDFUNDS or DGS10.'
              : 'No public delayed quote was returned for this symbol. Try a ticker or a configured watchlist item.');
        }
      } else if (source.adapterCode === 'TWELVE_DATA_QUOTE') {
        items = query.length === 0
          ? await twelveDataBrowse(source, apiKey)
          : await twelveDataQuotes(source, query, apiKey);
      } else if (source.adapterCode === 'FRED_SERIES' && assetClass === 'ECONOMICS') {
        items = await fredQuotes(source, query, apiKey);
      } else throw new Error('The configured financial-data adapter does not support this asset class.');
      const now = new Date();
      const displaySource = useFreeFallback ? (items[0]?.source ?? 'Free public display source') : source.name;
      const displaySourceCode = useFreeFallback ? (items[0]?.sourceCode ?? 'FREE_DISPLAY_SOURCE') : source.code;
      const displayItems = items.map(addVisualMetadata);
      const payload = {
        ok: true, source: displaySource, sourceCode: displaySourceCode,
        configuredSourceCode: source.code,
        dataPurpose: 'DISPLAY_ONLY', assetClass, quoteCurrency: source.quoteCurrency,
        query, fetchedAt: now.toISOString(), cacheSeconds: source.cacheSeconds,
        stale: false, cached: false, items: displayItems,
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
