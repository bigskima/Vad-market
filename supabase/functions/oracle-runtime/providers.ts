import { env } from './runtime.ts';
import { resolveFinancialPriceThresholdWithProvider } from './financial.ts';
import {
  type CryptoThresholdSpec,
  type CryptoTouchThresholdSpec,
  type FootballResultSpec,
  type JsonRecord,
  type OracleProvider,
  type OracleResource,
  OracleRuntimeError,
  type ProviderResolutionResult,
} from './types.ts';

function finiteNumber(value: unknown, label: string) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', `Provider returned invalid ${label}`, 502);
  }
  return parsed;
}

function metadataNumber(resource: OracleResource, key: string, fallback: number) {
  const value = resource.metadata?.[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function providerSecret(provider: OracleProvider) {
  if (!provider.secretReference) return null;
  return env(provider.secretReference);
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const latencyMs = Date.now() - started;
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new OracleRuntimeError(
        `PROVIDER_HTTP_${response.status}`,
        `Oracle provider returned HTTP ${response.status}`,
        502,
      );
    }
    return { payload, latencyMs };
  } catch (error) {
    if (error instanceof OracleRuntimeError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new OracleRuntimeError('PROVIDER_TIMEOUT', 'Oracle provider request timed out', 504);
    }
    throw new OracleRuntimeError('PROVIDER_NETWORK_ERROR', 'Oracle provider request failed', 502);
  } finally {
    clearTimeout(timer);
  }
}

function requiredSecret(provider: OracleProvider) {
  if (!provider.secretReference) return null;
  const secret = providerSecret(provider);
  if (!secret) {
    throw new OracleRuntimeError('SECRET_MISSING', `${provider.code} credential is not configured`, 503);
  }
  return secret;
}

export async function probeProvider(provider: OracleProvider) {
  const baseUrl = provider.baseUrl?.replace(/\/$/, '');
  if (provider.code === 'PUBLIC_RECORD' && !baseUrl) {
    return { latencyMs: 0, metadata: { adapter: provider.adapter, probe: 'CONFIGURED_RESOURCES_ONLY', resourceCount: provider.resources.length } };
  }
  if (!baseUrl) throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', `${provider.code} base URL is missing`, 500);

  switch (provider.code) {
    case 'PYTH': {
      const secret = requiredSecret(provider);
      const url = `${baseUrl}/v2/price_feeds?query=BTC&asset_type=crypto`;
      const result = await fetchJson(url, {
        headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
      });
      if (!Array.isArray(result.payload)) throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'Pyth health payload was invalid', 502);
      return { latencyMs: result.latencyMs, metadata: { adapter: provider.adapter, probe: 'PRICE_FEED_DISCOVERY' } };
    }
    case 'COINGECKO': {
      const secret = requiredSecret(provider);
      const result = await fetchJson(`${baseUrl}/ping`, {
        headers: { 'x-cg-demo-api-key': String(secret), Accept: 'application/json' },
      });
      return { latencyMs: result.latencyMs, metadata: { adapter: provider.adapter, probe: 'PING' } };
    }
    case 'FOOTBALL_DATA': {
      const secret = requiredSecret(provider);
      const result = await fetchJson(`${baseUrl}/competitions/PL`, {
        headers: { 'X-Auth-Token': String(secret), Accept: 'application/json' },
      });
      if (!result.payload || typeof result.payload !== 'object') {
        throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'Football-Data health payload was invalid', 502);
      }
      return { latencyMs: result.latencyMs, metadata: { adapter: provider.adapter, probe: 'COMPETITION' } };
    }
    case 'DIA': {
      const result = await fetchJson(`${baseUrl}/v1/quotation/BTC`, {
        headers: { Accept: 'application/json' },
      });
      if (!result.payload || typeof result.payload !== 'object') {
        throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'DIA health payload was invalid', 502);
      }
      return { latencyMs: result.latencyMs, metadata: { adapter: provider.adapter, probe: 'REFERENCE_QUOTATION' } };
    }
    case 'TWELVE_DATA': {
      const secret = requiredSecret(provider);
      const url = new URL('/quote', baseUrl);
      url.searchParams.set('symbol', 'AAPL');
      url.searchParams.set('apikey', String(secret));
      const result = await fetchJson(url.toString());
      if (!result.payload || typeof result.payload !== 'object' || (result.payload as JsonRecord).status === 'error') {
        throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'Twelve Data health quote was invalid', 502);
      }
      return { latencyMs: result.latencyMs, metadata: { adapter: provider.adapter, probe: 'SAMPLE_QUOTE' } };
    }
    case 'FRED': {
      const secret = requiredSecret(provider);
      const url = new URL('/fred/series', baseUrl);
      url.searchParams.set('series_id', 'GDP');
      url.searchParams.set('api_key', String(secret));
      url.searchParams.set('file_type', 'json');
      const result = await fetchJson(url.toString());
      if (!result.payload || typeof result.payload !== 'object' || (result.payload as JsonRecord).error_code) {
        throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'FRED health response was invalid', 502);
      }
      return { latencyMs: result.latencyMs, metadata: { adapter: provider.adapter, probe: 'SERIES_METADATA' } };
    }
    case 'TAVILY': {
      const secret = requiredSecret(provider);
      const url = `${baseUrl}/search`;
      const started = Date.now();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ api_key: secret, query: 'official public information', search_depth: 'basic', max_results: 1, include_answer: false }),
        signal: AbortSignal.timeout(12000),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== 'object' || !Array.isArray((payload as JsonRecord).results)) {
        throw new OracleRuntimeError(`PROVIDER_HTTP_${response.status}`, 'Tavily health search failed', 502);
      }
      return { latencyMs: Date.now() - started, metadata: { adapter: provider.adapter, probe: 'MINIMAL_SEARCH' } };
    }
    case 'THESPORTSDB': {
      const result = await fetchJson(`${baseUrl}/all_sports.php`);
      if (!result.payload || typeof result.payload !== 'object' || !Array.isArray((result.payload as JsonRecord).sports)) {
        throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'TheSportsDB health response was invalid', 502);
      }
      return { latencyMs: result.latencyMs, metadata: { adapter: provider.adapter, probe: 'SPORTS_CATALOG' } };
    }
    case 'API_SPORTS': {
      const secret = requiredSecret(provider);
      if (baseUrl !== 'https://v3.football.api-sports.io') {
        throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', 'API-Sports must use its approved HTTPS API host', 500);
      }
      const result = await fetchJson(`${baseUrl}/status`, {
        headers: { 'x-apisports-key': String(secret), Accept: 'application/json' },
      });
      if (!result.payload || typeof result.payload !== 'object' || (result.payload as JsonRecord).errors && Object.keys((result.payload as JsonRecord).errors as object).length > 0) {
        throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'API-Sports health response was invalid', 502);
      }
      return { latencyMs: result.latencyMs, metadata: { adapter: provider.adapter, probe: 'ACCOUNT_STATUS' } };
    }
    case 'US_SENATE': {
      if (baseUrl !== 'https://www.senate.gov') {
        throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', 'US Senate source must use its approved HTTPS host', 500);
      }
      const result = await fetchJson(`${baseUrl}/`, { headers: { Accept: 'text/html,application/xhtml+xml' } });
      if (typeof result.payload === 'string' && !result.payload.toLowerCase().includes('senate')) {
        throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'US Senate health response was not the expected site', 502);
      }
      return { latencyMs: result.latencyMs, metadata: { adapter: provider.adapter, probe: 'OFFICIAL_SITE' } };
    }
    default:
      throw new OracleRuntimeError('PROVIDER_ADAPTER_UNSUPPORTED', `No adapter is installed for ${provider.code}`, 501);
  }
}

function outcomeForThreshold(value: number, spec: CryptoThresholdSpec): 'YES' | 'NO' {
  let resolved = false;
  switch (spec.operator) {
    case 'GT': resolved = value > spec.threshold; break;
    case 'GTE': resolved = value >= spec.threshold; break;
    case 'LT': resolved = value < spec.threshold; break;
    case 'LTE': resolved = value <= spec.threshold; break;
  }
  return resolved ? 'YES' : 'NO';
}

function assertTimestampWindow(observedAt: Date, target: Date, maxDeltaSeconds: number) {
  const deltaSeconds = (observedAt.getTime() - target.getTime()) / 1000;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > maxDeltaSeconds) {
    throw new OracleRuntimeError(
      'SOURCE_TIMESTAMP_OUTSIDE_WINDOW',
      `Provider observation is outside the allowed ${maxDeltaSeconds}s window`,
      422,
    );
  }
  return deltaSeconds;
}

async function pythCryptoObservation(
  provider: OracleProvider,
  resource: OracleResource,
  spec: CryptoThresholdSpec,
): Promise<ProviderResolutionResult> {
  const secret = requiredSecret(provider);
  const baseUrl = provider.baseUrl!.replace(/\/$/, '');
  const searchUrl = new URL(`${baseUrl}/v2/price_feeds`);
  searchUrl.searchParams.set('query', spec.asset);
  searchUrl.searchParams.set('asset_type', 'crypto');

  const feedResponse = await fetchJson(searchUrl.toString(), {
    headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
  });
  if (!Array.isArray(feedResponse.payload)) {
    throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'Pyth feed discovery returned invalid data', 502);
  }

  const expectedSymbol = resource.externalKey.toUpperCase();
  const feed = feedResponse.payload.find((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const symbol = (item as JsonRecord).attributes;
    return Boolean(symbol && typeof symbol === 'object' && String((symbol as JsonRecord).symbol ?? '').toUpperCase() === expectedSymbol);
  }) as JsonRecord | undefined;
  const feedId = typeof feed?.id === 'string' ? feed.id.replace(/^0x/, '') : null;
  if (!feedId) throw new OracleRuntimeError('PYTH_FEED_NOT_FOUND', `Pyth feed ${resource.externalKey} was not found`, 422);

  const targetSeconds = Math.floor(spec.observationTime.getTime() / 1000);
  const priceUrl = new URL(`${baseUrl}/v2/updates/price/${targetSeconds}`);
  priceUrl.searchParams.append('ids[]', feedId);
  priceUrl.searchParams.set('parsed', 'true');

  const priceResponse = await fetchJson(priceUrl.toString(), {
    headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
  });
  const parsed = priceResponse.payload && typeof priceResponse.payload === 'object'
    ? (priceResponse.payload as JsonRecord).parsed
    : null;
  const row = Array.isArray(parsed) ? parsed[0] as JsonRecord | undefined : undefined;
  const priceNode = row?.price && typeof row.price === 'object' ? row.price as JsonRecord : null;
  if (!row || !priceNode) throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'Pyth price payload was invalid', 502);

  const rawPrice = finiteNumber(priceNode.price, 'Pyth price');
  const exponent = finiteNumber(priceNode.expo, 'Pyth exponent');
  const price = rawPrice * (10 ** exponent);
  if (!Number.isFinite(price) || price <= 0) throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'Pyth normalized price was invalid', 502);

  const publishTime = finiteNumber(priceNode.publish_time, 'Pyth publish time');
  const observedAt = new Date(publishTime * 1000);
  const maxDelta = metadataNumber(resource, 'max_timestamp_delta_seconds', 120);
  const deltaSeconds = assertTimestampWindow(observedAt, spec.observationTime, maxDelta);

  return {
    kind: 'observation',
    observation: {
      observedOutcome: outcomeForThreshold(price, spec),
      observedAt,
      evidenceReference: priceUrl.toString(),
      payload: {
        resolver_type: spec.resolverType,
        asset: spec.asset,
        quote: spec.quote,
        operator: spec.operator,
        threshold: spec.threshold,
        price,
        source_timestamp: observedAt.toISOString(),
        target_timestamp: spec.observationTime.toISOString(),
        timestamp_delta_seconds: deltaSeconds,
        feed_id: feedId,
        feed_symbol: resource.externalKey,
        confidence: priceNode.conf ?? null,
      },
    },
  };
}

async function coinGeckoCryptoObservation(
  provider: OracleProvider,
  resource: OracleResource,
  spec: CryptoThresholdSpec,
): Promise<ProviderResolutionResult> {
  const secret = requiredSecret(provider);
  const baseUrl = provider.baseUrl!.replace(/\/$/, '');
  const maxDelta = metadataNumber(resource, 'max_timestamp_delta_seconds', 600);
  const targetSeconds = Math.floor(spec.observationTime.getTime() / 1000);
  const rangeUrl = new URL(`${baseUrl}/coins/${encodeURIComponent(resource.externalKey)}/market_chart/range`);
  rangeUrl.searchParams.set('vs_currency', spec.quote.toLowerCase());
  rangeUrl.searchParams.set('from', String(Math.max(0, targetSeconds - maxDelta)));
  rangeUrl.searchParams.set('to', String(targetSeconds + maxDelta));
  rangeUrl.searchParams.set('precision', 'full');

  const result = await fetchJson(rangeUrl.toString(), {
    headers: { 'x-cg-demo-api-key': String(secret), Accept: 'application/json' },
  });
  const prices = result.payload && typeof result.payload === 'object'
    ? (result.payload as JsonRecord).prices
    : null;
  if (!Array.isArray(prices) || prices.length === 0) {
    throw new OracleRuntimeError('COINGECKO_PRICE_NOT_FOUND', 'CoinGecko returned no price points for the resolution window', 422);
  }

  const targetMs = spec.observationTime.getTime();
  const candidates = prices
    .filter((item: unknown) => Array.isArray(item) && item.length >= 2)
    .map((item: unknown) => {
      const pair = item as unknown[];
      return { timestamp: finiteNumber(pair[0], 'CoinGecko timestamp'), price: finiteNumber(pair[1], 'CoinGecko price') };
    })
    .filter((item) => item.timestamp >= targetMs)
    .sort((a, b) => a.timestamp - b.timestamp);
  const selected = candidates[0];
  if (!selected) {
    throw new OracleRuntimeError('COINGECKO_PRICE_NOT_FOUND', 'CoinGecko had no price point at or after the target time', 422);
  }

  const observedAt = new Date(selected.timestamp);
  const deltaSeconds = assertTimestampWindow(observedAt, spec.observationTime, maxDelta);
  if (selected.price <= 0) throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'CoinGecko price was invalid', 502);

  return {
    kind: 'observation',
    observation: {
      observedOutcome: outcomeForThreshold(selected.price, spec),
      observedAt,
      evidenceReference: rangeUrl.toString(),
      payload: {
        resolver_type: spec.resolverType,
        asset: spec.asset,
        quote: spec.quote,
        operator: spec.operator,
        threshold: spec.threshold,
        price: selected.price,
        source_timestamp: observedAt.toISOString(),
        target_timestamp: spec.observationTime.toISOString(),
        timestamp_delta_seconds: deltaSeconds,
        coin_id: resource.externalKey,
      },
    },
  };
}

export async function resolveCryptoTouchWithCoinGecko(
  provider: OracleProvider,
  resource: OracleResource,
  spec: CryptoTouchThresholdSpec,
): Promise<ProviderResolutionResult> {
  if (provider.code !== 'COINGECKO') return { kind: 'skipped', code: 'PROVIDER_NOT_COMPATIBLE' };
  if (resource.status !== 'ACTIVE') return { kind: 'skipped', code: 'RESOURCE_DISABLED' };
  const secret = requiredSecret(provider);
  const baseUrl = provider.baseUrl?.replace(/\/$/, '');
  if (!baseUrl || baseUrl !== 'https://api.coingecko.com/api/v3') {
    throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', 'CoinGecko must use its approved HTTPS API host', 500);
  }
  if (spec.windowEnd <= spec.windowStart || spec.windowEnd.getTime() > Date.now()) {
    throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Crypto threshold-touch window must be valid and end in the past', 422);
  }
  const coverageGapSeconds = Math.max(60, Math.min(1800, metadataNumber(resource, 'maximum_coverage_gap_seconds', 900)));
  const from = Math.floor(spec.windowStart.getTime() / 1000);
  const to = Math.floor(spec.windowEnd.getTime() / 1000) + coverageGapSeconds;
  const url = new URL(`${baseUrl}/coins/${encodeURIComponent(resource.externalKey)}/market_chart/range`);
  url.searchParams.set('vs_currency', spec.quote.toLowerCase());
  url.searchParams.set('from', String(from));
  url.searchParams.set('to', String(to));
  url.searchParams.set('precision', 'full');
  const result = await fetchJson(url.toString(), {
    headers: { 'x-cg-demo-api-key': String(secret), Accept: 'application/json' },
  });
  const prices = result.payload && typeof result.payload === 'object'
    ? (result.payload as JsonRecord).prices
    : null;
  if (!Array.isArray(prices) || prices.length === 0) {
    throw new OracleRuntimeError('COINGECKO_PRICE_NOT_FOUND', 'CoinGecko returned no prices for the threshold-touch window', 422);
  }
  const startMs = spec.windowStart.getTime();
  const endMs = spec.windowEnd.getTime();
  const points = prices
    .filter((item: unknown) => Array.isArray(item) && item.length >= 2)
    .map((item: unknown) => {
      const pair = item as unknown[];
      return {
        timestamp: finiteNumber(pair[0], 'CoinGecko timestamp'),
        price: finiteNumber(pair[1], 'CoinGecko price'),
      };
    })
    .filter((point) => point.timestamp >= startMs && point.timestamp <= endMs && point.price > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!points.length) {
    return { kind: 'skipped', code: 'COINGECKO_WINDOW_EMPTY', detail: 'No provider price points fell inside the configured threshold-touch window' };
  }
  const hit = (value: number) => spec.operator === 'GT' ? value > spec.threshold
    : spec.operator === 'GTE' ? value >= spec.threshold
      : spec.operator === 'LT' ? value < spec.threshold
        : value <= spec.threshold;
  const hitPoints = points.filter((point) => hit(point.price));
  const maxPrice = Math.max(...points.map((point) => point.price));
  const minPrice = Math.min(...points.map((point) => point.price));
  const first = points[0];
  const last = points[points.length - 1];
  const fullCoverage = first.timestamp <= startMs + coverageGapSeconds * 1000
    && last.timestamp >= endMs - coverageGapSeconds * 1000;
  // A qualifying historical datapoint is sufficient to prove a touch. A NO
  // requires coverage near both window boundaries; missing coverage is never
  // interpreted as proof that the price did not touch the threshold.
  if (!hitPoints.length && !fullCoverage) {
    return {
      kind: 'skipped',
      code: 'COINGECKO_WINDOW_INCOMPLETE',
      detail: 'Historical samples did not cover both ends of the threshold-touch window; a negative result is not safe',
    };
  }
  const selected = hitPoints.length
    ? hitPoints.sort((a, b) => Math.abs(a.price - spec.threshold) - Math.abs(b.price - spec.threshold))[0]
    : last;
  const observedAt = new Date(selected.timestamp);
  const evidenceUrl = new URL(url.toString());
  return {
    kind: 'observation',
    observation: {
      observedOutcome: hitPoints.length ? 'YES' : 'NO',
      observedAt,
      evidenceReference: evidenceUrl.toString(),
      payload: {
        resolver_type: spec.resolverType,
        source: provider.code,
        asset: spec.asset,
        quote: spec.quote,
        operator: spec.operator,
        threshold: spec.threshold,
        window_start: spec.windowStart.toISOString(),
        window_end: spec.windowEnd.toISOString(),
        sample_count: points.length,
        minimum_price: minPrice,
        maximum_price: maxPrice,
        threshold_touched: hitPoints.length > 0,
        evidence_timestamp: observedAt.toISOString(),
        coverage_complete: fullCoverage,
        coin_id: resource.externalKey,
      },
    },
  };
}

async function diaCryptoObservation(
  provider: OracleProvider,
  resource: OracleResource,
  spec: CryptoThresholdSpec,
): Promise<ProviderResolutionResult> {
  if (resource.metadata?.settlement_eligible !== true) {
    return { kind: 'skipped', code: 'REFERENCE_ONLY', detail: 'DIA public reference route is not enabled for financial consensus' };
  }
  const baseUrl = provider.baseUrl!.replace(/\/$/, '');
  const quotationUrl = `${baseUrl}/v1/quotation/${encodeURIComponent(resource.externalKey)}`;
  const result = await fetchJson(quotationUrl, { headers: { Accept: 'application/json' } });
  if (!result.payload || typeof result.payload !== 'object') {
    throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'DIA quotation payload was invalid', 502);
  }
  const payload = result.payload as JsonRecord;
  const price = finiteNumber(payload.Price, 'DIA price');
  const observedAt = new Date(String(payload.Time ?? ''));
  if (!Number.isFinite(observedAt.getTime())) throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'DIA timestamp was invalid', 502);
  const maxDelta = metadataNumber(resource, 'max_timestamp_delta_seconds', 180);
  const deltaSeconds = assertTimestampWindow(observedAt, spec.observationTime, maxDelta);

  return {
    kind: 'observation',
    observation: {
      observedOutcome: outcomeForThreshold(price, spec),
      observedAt,
      evidenceReference: quotationUrl,
      payload: {
        resolver_type: spec.resolverType,
        asset: spec.asset,
        quote: spec.quote,
        operator: spec.operator,
        threshold: spec.threshold,
        price,
        source_timestamp: observedAt.toISOString(),
        target_timestamp: spec.observationTime.toISOString(),
        timestamp_delta_seconds: deltaSeconds,
        symbol: resource.externalKey,
      },
    },
  };
}

export async function resolveCryptoWithProvider(
  provider: OracleProvider,
  resource: OracleResource,
  spec: CryptoThresholdSpec,
): Promise<ProviderResolutionResult> {
  if (resource.status !== 'ACTIVE') return { kind: 'skipped', code: 'RESOURCE_DISABLED' };
  switch (provider.code) {
    case 'PYTH': return pythCryptoObservation(provider, resource, spec);
    case 'COINGECKO': return coinGeckoCryptoObservation(provider, resource, spec);
    case 'DIA': return diaCryptoObservation(provider, resource, spec);
    case 'TWELVE_DATA': return resolveFinancialPriceThresholdWithProvider(provider, resource, {
      resolverType: 'FINANCIAL_PRICE_THRESHOLD_V1',
      symbol: spec.asset,
      quote: spec.quote,
      operator: spec.operator,
      threshold: spec.threshold,
      observationTime: spec.observationTime,
    });
    default: return { kind: 'skipped', code: 'PROVIDER_NOT_COMPATIBLE' };
  }
}

export async function resolveFootballWithProvider(
  provider: OracleProvider,
  resource: OracleResource,
  spec: FootballResultSpec,
): Promise<ProviderResolutionResult> {
  if (provider.code !== 'FOOTBALL_DATA') return { kind: 'skipped', code: 'PROVIDER_NOT_COMPATIBLE' };
  if (resource.status !== 'ACTIVE') return { kind: 'skipped', code: 'RESOURCE_DISABLED' };
  const secret = requiredSecret(provider);
  const baseUrl = provider.baseUrl!.replace(/\/$/, '');
  const matchId = resource.externalKey.trim();
  if (!/^\d+$/.test(matchId)) throw new OracleRuntimeError('FOOTBALL_RESOURCE_INVALID', 'Football-Data match id is invalid', 422);

  const matchUrl = `${baseUrl}/matches/${encodeURIComponent(matchId)}`;
  const result = await fetchJson(matchUrl, {
    headers: { 'X-Auth-Token': String(secret), Accept: 'application/json' },
  });
  if (!result.payload || typeof result.payload !== 'object') {
    throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'Football-Data match payload was invalid', 502);
  }
  const payload = result.payload as JsonRecord;
  const status = String(payload.status ?? '').toUpperCase();
  if (status !== 'FINISHED') {
    return { kind: 'skipped', code: `MATCH_${status || 'NOT_FINAL'}`, detail: 'Match is not in a final FINISHED state' };
  }
  const score = payload.score && typeof payload.score === 'object' ? payload.score as JsonRecord : null;
  const winner = String(score?.winner ?? '').toUpperCase();
  const actual = winner === 'HOME_TEAM' ? 'HOME_WIN' : winner === 'AWAY_TEAM' ? 'AWAY_WIN' : winner === 'DRAW' ? 'DRAW' : null;
  if (!actual) throw new OracleRuntimeError('FOOTBALL_RESULT_INVALID', 'Football-Data final winner was unavailable', 502);

  const lastUpdated = new Date(String(payload.lastUpdated ?? ''));
  const observedAt = Number.isFinite(lastUpdated.getTime()) ? lastUpdated : new Date();
  const fullTime = score?.fullTime && typeof score.fullTime === 'object' ? score.fullTime as JsonRecord : {};

  return {
    kind: 'observation',
    observation: {
      observedOutcome: actual === spec.condition ? 'YES' : 'NO',
      observedAt,
      evidenceReference: matchUrl,
      payload: {
        resolver_type: spec.resolverType,
        match_id: matchId,
        status,
        requested_condition: spec.condition,
        actual_result: actual,
        home_score: fullTime.home ?? null,
        away_score: fullTime.away ?? null,
        utc_date: payload.utcDate ?? null,
        last_updated: payload.lastUpdated ?? null,
      },
    },
  };
}
