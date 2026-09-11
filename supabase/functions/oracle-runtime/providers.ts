import { env } from './runtime.ts';
import {
  type CryptoThresholdSpec,
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
