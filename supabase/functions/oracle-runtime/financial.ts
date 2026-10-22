import {
  type FinancialPriceThresholdSpec,
  type FredSeriesThresholdSpec,
  type CryptoTouchThresholdSpec,
  type JsonRecord,
  type OracleProvider,
  type OracleResource,
  OracleRuntimeError,
  type ProviderResolutionResult,
} from './types.ts';
import { env } from './runtime.ts';
import { hasContinuousTimestampCoverage } from './coverage.ts';

function record(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, max = 180) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === '.') return null;
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : null;
}
function outcome(value: number, operator: 'GT' | 'GTE' | 'LT' | 'LTE', threshold: number): 'YES' | 'NO' {
  const yes = operator === 'GT' ? value > threshold
    : operator === 'GTE' ? value >= threshold
      : operator === 'LT' ? value < threshold
        : value <= threshold;
  return yes ? 'YES' : 'NO';
}
function apiSecret(provider: OracleProvider) {
  const secretName = text(provider.secretReference, 120);
  return secretName ? env(secretName) : null;
}
async function fetchJson(url: URL, timeoutMs = 15_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'VAD-Oracle/1.0' },
    });
    const raw = await response.text();
    if (raw.length > 1_500_000) {
      throw new OracleRuntimeError('PROVIDER_PAYLOAD_TOO_LARGE', 'Financial source response exceeded the allowed size', 502);
    }
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch {
      throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'Financial source returned invalid JSON', 502);
    }
    if (!response.ok) {
      throw new OracleRuntimeError(`PROVIDER_HTTP_${response.status}`, `Financial source returned HTTP ${response.status}`, 502);
    }
    return payload;
  } catch (error) {
    if (error instanceof OracleRuntimeError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new OracleRuntimeError('PROVIDER_TIMEOUT', 'Financial source request timed out', 504);
    }
    throw new OracleRuntimeError('PROVIDER_NETWORK_ERROR', 'Financial source request failed', 502);
  } finally {
    clearTimeout(timer);
  }
}
function safeEvidenceUrl(url: URL) {
  const safe = new URL(url.toString());
  safe.searchParams.delete('apikey');
  safe.searchParams.delete('api_key');
  return safe.toString();
}
function timestamp(value: unknown): Date | null {
  const raw = text(value, 80);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? raw.replace(' ', 'T') + 'Z'
    : raw;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function timestampInTimeZone(value: unknown, timeZone: string): Date | null {
  const raw = text(value, 80);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return timestamp(raw);
  try {
    const [, year, month, day, hour, minute, second] = match;
    const intendedUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(formatter.formatToParts(new Date(intendedUtc))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]));
    const displayedAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const candidate = new Date(intendedUtc + intendedUtc - displayedAsUtc);
    // Re-check the wall-clock representation to avoid silently accepting an
    // unknown zone or a timestamp on a DST gap.
    const verify = Object.fromEntries(formatter.formatToParts(candidate)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]));
    if (Number(verify.year) !== Number(year)
        || Number(verify.month) !== Number(month)
        || Number(verify.day) !== Number(day)
        || Number(verify.hour) !== Number(hour)
        || Number(verify.minute) !== Number(minute)
        || Number(verify.second) !== Number(second)) {
      return null;
    }
    return Number.isFinite(candidate.getTime()) ? candidate : null;
  } catch {
    return null;
  }
}
function withinWindow(observedAt: Date, target: Date, maxSeconds: number) {
  const delta = Math.abs(observedAt.getTime() - target.getTime()) / 1000;
  if (!Number.isFinite(delta) || delta > maxSeconds) {
    throw new OracleRuntimeError('SOURCE_TIMESTAMP_OUTSIDE_WINDOW', 'No source observation exists inside the market resolution window', 422);
  }
  return delta;
}

export async function resolveFinancialPriceThresholdWithProvider(
  provider: OracleProvider,
  resource: OracleResource,
  spec: FinancialPriceThresholdSpec,
): Promise<ProviderResolutionResult> {
  if (!['TWELVE_DATA','ALPHA_VANTAGE'].includes(provider.code)) return { kind: 'skipped', code: 'PROVIDER_NOT_COMPATIBLE' };
  if (resource.status !== 'ACTIVE') return { kind: 'skipped', code: 'RESOURCE_DISABLED' };
  const key = apiSecret(provider);
  if (!key) throw new OracleRuntimeError('SECRET_MISSING', `${provider.name} API credential is not configured`, 503);
  const base = provider.baseUrl?.replace(/\/$/, '');
  const maxDelta = Math.max(1, Math.min(3600, Number(resource.metadata?.max_timestamp_delta_seconds ?? 600)));

  if (provider.code === 'ALPHA_VANTAGE') {
    if (base !== 'https://www.alphavantage.co') {
      throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', 'Alpha Vantage must use its approved HTTPS API host', 500);
    }
    const fn = text(resource.metadata?.alpha_vantage_function, 60);
    if (!['TIME_SERIES_INTRADAY','FX_INTRADAY'].includes(fn)) {
      return { kind: 'skipped', code: 'ALPHA_VANTAGE_MAPPING_UNSUPPORTED', detail: 'Alpha Vantage has no approved historical mapping for this instrument' };
    }
    const symbol = text(resource.externalKey, 80) || spec.symbol;
    const parts = symbol.split('/');
    const url = new URL('/query', base);
    url.searchParams.set('function', fn);
    if (fn === 'FX_INTRADAY') {
      if (parts.length !== 2) return { kind: 'skipped', code: 'ALPHA_VANTAGE_SYMBOL_INVALID' };
      url.searchParams.set('from_symbol', parts[0]);
      url.searchParams.set('to_symbol', parts[1]);
    } else {
      url.searchParams.set('symbol', parts[0]);
      url.searchParams.set('interval', text(resource.metadata?.interval, 20) || '1min');
    }
    url.searchParams.set('outputsize', 'full');
    url.searchParams.set('apikey', key);
    const payload = await fetchJson(url);
    if (!record(payload)) throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'Alpha Vantage returned an invalid time-series response', 502);
    if (payload.Note || payload.Information || payload['Error Message']) {
      throw new OracleRuntimeError('PROVIDER_LIMIT_OR_PAYLOAD_INVALID', text(payload.Note ?? payload.Information ?? payload['Error Message'], 220) || 'Alpha Vantage returned no usable historical data', 502);
    }
    const seriesEntry = Object.entries(payload).find(([name, value]) => /time series/i.test(name) && record(value));
    if (!seriesEntry) return { kind: 'skipped', code: 'ALPHA_VANTAGE_SERIES_NOT_FOUND', detail: 'Alpha Vantage did not return the configured intraday series' };
    const meta = record(payload['Meta Data']) ? payload['Meta Data'] : {};
    const timeZone = text(meta['6. Time Zone'], 80);
    if (!timeZone) return { kind: 'skipped', code: 'ALPHA_VANTAGE_TIME_ZONE_MISSING', detail: 'Alpha Vantage omitted the time zone required to evaluate the exact observation window safely' };
    const values = Object.entries(seriesEntry[1] as JsonRecord).map(([datetime, raw]) => ({
      datetime,
      time: timestampInTimeZone(datetime, timeZone),
      value: record(raw) ? numeric(raw['4. close'] ?? raw.close) : null,
    })).filter((point): point is { datetime: string; time: Date; value: number } =>
      point.time !== null && point.value !== null && point.value > 0
    );
    const target = spec.observationTime.getTime();
    const selected = values.filter((point) => point.time.getTime() >= target)
      .filter((point) => (point.time.getTime() - target) / 1000 <= maxDelta)
      .sort((a, b) => a.time.getTime() - b.time.getTime())[0];
    if (!selected) return { kind: 'skipped', code: 'ALPHA_VANTAGE_TARGET_OBSERVATION_MISSING', detail: 'Alpha Vantage has no timestamped price inside the post-observation tolerance window' };
    const safeUrl = new URL(url.toString());
    safeUrl.searchParams.delete('apikey');
    return {
      kind: 'observation',
      observation: {
        observedOutcome: outcome(selected.value, spec.operator, spec.threshold),
        observedAt: selected.time,
        evidenceReference: safeUrl.toString(),
        payload: {
          resolver_type: spec.resolverType,
          provider: provider.code,
          symbol: spec.symbol,
          quote: spec.quote,
          operator: spec.operator,
          threshold: spec.threshold,
          price: selected.value,
          source_timestamp: selected.time.toISOString(),
          target_timestamp: spec.observationTime.toISOString(),
          timestamp_delta_seconds: (selected.time.getTime() - target) / 1000,
          alpha_vantage_function: fn,
        },
      },
    };
  }
  if (base !== 'https://api.twelvedata.com') {
    throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', 'Twelve Data must use its approved HTTPS API host', 500);
  }
  // The observation must be at or after the contract's timestamp. A nearby
  // pre-cutoff quote is not a valid substitute for the required post-cutoff sample.
  const start = new Date(spec.observationTime.getTime());
  const end = new Date(spec.observationTime.getTime() + maxDelta * 1000);
  const format = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ');
  const url = new URL('/time_series', base);
  url.searchParams.set('symbol', text(resource.externalKey, 80) || `${spec.symbol}/${spec.quote}`);
  url.searchParams.set('interval', text(resource.metadata?.interval, 20) || '1min');
  url.searchParams.set('start_date', format(start));
  url.searchParams.set('end_date', format(end));
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('order', 'ASC');
  url.searchParams.set('outputsize', '5000');
  url.searchParams.set('apikey', key);
  const payload = await fetchJson(url);
  if (!record(payload) || payload.status === 'error') {
    const msg = record(payload) ? text(payload.message, 240) : '';
    throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', msg || 'Twelve Data returned no usable time-series payload', 502);
  }
  const values = Array.isArray(payload.values) ? payload.values.filter(record) : [];
  const points = values.map((row) => ({
    row,
    time: timestamp(row.datetime ?? row.timestamp),
    value: numeric(row.close ?? row.price),
  })).filter((point): point is { row: JsonRecord; time: Date; value: number } =>
    point.time !== null && point.value !== null && point.time.getTime() >= spec.observationTime.getTime()
  ).sort((a, b) => a.time.getTime() - b.time.getTime());
  const selected = points[0];
  if (!selected) return { kind: 'skipped', code: 'FINANCIAL_OBSERVATION_MISSING', detail: 'Twelve Data returned no usable price point in the configured time window' };
  const deltaSeconds = withinWindow(selected.time, spec.observationTime, maxDelta);
  const price = selected.value;
  if (!Number.isFinite(price) || price <= 0) throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', 'Twelve Data returned an invalid instrument price', 502);
  const evidence = new URL(url.toString());
  return {
    kind: 'observation',
    observation: {
      observedOutcome: outcome(price, spec.operator, spec.threshold),
      observedAt: selected.time,
      evidenceReference: safeEvidenceUrl(evidence),
      payload: {
        resolver_type: spec.resolverType,
        provider: provider.code,
        symbol: spec.symbol,
        quote: spec.quote,
        operator: spec.operator,
        threshold: spec.threshold,
        price,
        observation_timestamp: selected.time.toISOString(),
        target_timestamp: spec.observationTime.toISOString(),
        timestamp_delta_seconds: deltaSeconds,
        interval: text(payload.meta && record(payload.meta) ? payload.meta.interval : null, 20) || '1min',
      },
    },
  };
}

export async function resolveFinancialPriceTouchThresholdWithProvider(
  provider: OracleProvider,
  resource: OracleResource,
  spec: CryptoTouchThresholdSpec,
): Promise<ProviderResolutionResult> {
  if (provider.code !== 'TWELVE_DATA') return { kind: 'skipped', code: 'PROVIDER_NOT_COMPATIBLE' };
  if (resource.status !== 'ACTIVE') return { kind: 'skipped', code: 'RESOURCE_DISABLED' };
  const key = apiSecret(provider);
  if (!key) throw new OracleRuntimeError('SECRET_MISSING', 'Twelve Data API credential is not configured', 503);
  const base = provider.baseUrl?.replace(/\/$/, '');
  if (base !== 'https://api.twelvedata.com') {
    throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', 'Twelve Data must use its approved HTTPS API host', 500);
  }
  if (spec.windowEnd <= spec.windowStart || spec.windowEnd.getTime() > Date.now()) {
    throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Financial threshold-touch window must be valid and end in the past', 422);
  }
  const symbol = text(resource.externalKey, 80) || `${spec.asset}/${spec.quote}`;
  const interval = text(resource.metadata?.interval, 20) || '1min';
  const url = new URL('/time_series', base);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', interval);
  url.searchParams.set('start_date', spec.windowStart.toISOString().slice(0, 19).replace('T', ' '));
  url.searchParams.set('end_date', spec.windowEnd.toISOString().slice(0, 19).replace('T', ' '));
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('order', 'ASC');
  url.searchParams.set('outputsize', '5000');
  url.searchParams.set('apikey', key);
  const payload = await fetchJson(url);
  if (!record(payload) || payload.status === 'error') {
    const message = record(payload) ? text(payload.message, 240) : '';
    throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', message || 'Twelve Data returned no usable historical price range', 502);
  }
  const rawValues = Array.isArray(payload.values) ? payload.values.filter(record) : [];
  const points = rawValues.map((row) => ({
    row,
    time: timestamp(row.datetime ?? row.timestamp),
    value: numeric(row.close ?? row.price),
  })).filter((point): point is { row: JsonRecord; time: Date; value: number } =>
    point.time !== null && point.value !== null && point.value > 0
  ).filter((point) => point.time >= spec.windowStart && point.time <= spec.windowEnd)
    .sort((a, b) => a.time.getTime() - b.time.getTime());
  if (!points.length) return { kind: 'skipped', code: 'TWELVE_DATA_WINDOW_EMPTY', detail: 'No historical price points fell inside the configured window' };
  const hit = (value: number) => spec.operator === 'GT' ? value > spec.threshold
    : spec.operator === 'GTE' ? value >= spec.threshold
      : spec.operator === 'LT' ? value < spec.threshold
        : value <= spec.threshold;
  const hitPoints = points.filter((point) => hit(point.value));
  const maxPrice = Math.max(...points.map((point) => point.value));
  const minPrice = Math.min(...points.map((point) => point.value));
  const last = points[points.length - 1];
  const maxGapSeconds = Math.max(60, Math.min(1800, Number(resource.metadata?.maximum_coverage_gap_seconds ?? 900) || 900));
  const fullCoverage = hasContinuousTimestampCoverage(
    points.map((point) => point.time.getTime()),
    spec.windowStart.getTime(),
    spec.windowEnd.getTime(),
    maxGapSeconds,
  );
  if (!hitPoints.length && !fullCoverage) {
    return { kind: 'skipped', code: 'TWELVE_DATA_WINDOW_INCOMPLETE', detail: 'Historical data did not cover both ends of the time window; a negative result is unsafe' };
  }
  const selected = hitPoints.length
    ? hitPoints.sort((a, b) => Math.abs(a.value - spec.threshold) - Math.abs(b.value - spec.threshold))[0]
    : last;
  const safeUrl = new URL(url.toString());
  safeUrl.searchParams.delete('apikey');
  return {
    kind: 'observation',
    observation: {
      observedOutcome: hitPoints.length ? 'YES' : 'NO',
      observedAt: selected.time,
      evidenceReference: safeUrl.toString(),
      payload: {
        resolver_type: spec.resolverType,
        provider: provider.code,
        symbol,
        quote: spec.quote,
        operator: spec.operator,
        threshold: spec.threshold,
        window_start: spec.windowStart.toISOString(),
        window_end: spec.windowEnd.toISOString(),
        sample_count: points.length,
        minimum_price: minPrice,
        maximum_price: maxPrice,
        threshold_touched: hitPoints.length > 0,
        evidence_timestamp: selected.time.toISOString(),
        coverage_complete: fullCoverage,
        interval,
      },
    },
  };
}

export async function resolveFredSeriesThresholdWithProvider(
  provider: OracleProvider,
  resource: OracleResource,
  spec: FredSeriesThresholdSpec,
): Promise<ProviderResolutionResult> {
  if (!['FRED', 'ALPHA_VANTAGE'].includes(provider.code)) return { kind: 'skipped', code: 'PROVIDER_NOT_COMPATIBLE' };
  if (resource.status !== 'ACTIVE') return { kind: 'skipped', code: 'RESOURCE_DISABLED' };
  const key = apiSecret(provider);
  if (!key) throw new OracleRuntimeError('SECRET_MISSING', `${provider.name} API credential is not configured`, 503);

  if (provider.code === 'ALPHA_VANTAGE') {
    const fn = text(resource.metadata?.alpha_vantage_function, 60);
    if (!fn || !/^[A-Z_]+$/.test(fn)) return { kind: 'skipped', code: 'ALPHA_VANTAGE_MAPPING_MISSING' };
    const base = provider.baseUrl?.replace(/\/$/, '');
    if (base !== 'https://www.alphavantage.co') {
      throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', 'Alpha Vantage must use its approved HTTPS API host', 500);
    }
    const alternateUrl = new URL('/query', base);
    alternateUrl.searchParams.set('function', fn);
    alternateUrl.searchParams.set('apikey', key);
    const altPayload = await fetchJson(alternateUrl);
    if (!record(altPayload) || altPayload.Note || altPayload.Information || altPayload['Error Message']) {
      const message = record(altPayload) ? text(altPayload.Note ?? altPayload.Information ?? altPayload['Error Message'], 220) : '';
      throw new OracleRuntimeError('PROVIDER_LIMIT_OR_PAYLOAD_INVALID', message || 'Alpha Vantage returned no usable economic series data', 502);
    }
    const data = Array.isArray(altPayload.data) ? altPayload.data.filter(record) : [];
    const row = data.find((item) => text(item.date, 20) === spec.observationDate && numeric(item.value) !== null);
    if (!row) return { kind: 'skipped', code: 'ALPHA_VANTAGE_OBSERVATION_NOT_FOUND', detail: 'The secondary economic source has no value for the requested observation date' };
    const value = numeric(row.value);
    if (value === null) return { kind: 'skipped', code: 'ALPHA_VANTAGE_OBSERVATION_INVALID' };
    const evidence = new URL(alternateUrl.toString());
    evidence.searchParams.delete('apikey');
    return {
      kind: 'observation',
      observation: {
        observedOutcome: outcome(value, spec.operator, spec.threshold),
        observedAt: new Date(spec.observationDate + 'T00:00:00.000Z'),
        evidenceReference: evidence.toString(),
        payload: {
          resolver_type: spec.resolverType,
          provider: provider.code,
          series_id: spec.seriesId,
          alpha_vantage_function: fn,
          observation_date: spec.observationDate,
          value,
          operator: spec.operator,
          threshold: spec.threshold,
          revision_handling: 'CURRENT_SERIES_VALUE_NOT_VINTAGE_SPECIFIC',
          corroboration_role: 'SECONDARY_ONLY',
        },
      },
    };
  }

  const base = provider.baseUrl?.replace(/\/$/, '');
  if (base !== 'https://api.stlouisfed.org/fred') {
    throw new OracleRuntimeError('PROVIDER_CONFIG_INVALID', 'FRED must use its approved HTTPS API host and path', 500);
  }
  const url = new URL('/fred/series/observations', base);
  url.searchParams.set('series_id', spec.seriesId);
  url.searchParams.set('observation_start', spec.observationDate);
  url.searchParams.set('observation_end', spec.observationDate);
  url.searchParams.set('realtime_start', spec.vintageDate ?? spec.observationDate);
  url.searchParams.set('realtime_end', spec.vintageDate ?? spec.observationDate);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('sort_order', 'asc');
  url.searchParams.set('api_key', key);
  const payload = await fetchJson(url);
  if (!record(payload) || payload.error_code) {
    throw new OracleRuntimeError('PROVIDER_PAYLOAD_INVALID', record(payload)
      ? text(payload.error_message, 240) || 'FRED returned an invalid series response'
      : 'FRED returned an invalid series response', 502);
  }
  const rows = Array.isArray(payload.observations) ? payload.observations.filter(record) : [];
  const row = rows.find((item) => text(item.date, 20) === spec.observationDate && numeric(item.value) !== null);
  if (!row) return { kind: 'skipped', code: 'FRED_OBSERVATION_NOT_PUBLISHED', detail: 'FRED has not published a numeric value for the configured observation date and vintage' };
  const value = numeric(row.value);
  if (value === null) return { kind: 'skipped', code: 'FRED_OBSERVATION_NOT_PUBLISHED' };
  const observedAt = new Date(spec.observationDate + 'T00:00:00.000Z');
  const evidence = new URL(url.toString());
  return {
    kind: 'observation',
    observation: {
      observedOutcome: outcome(value, spec.operator, spec.threshold),
      observedAt,
      evidenceReference: safeEvidenceUrl(evidence),
      payload: {
        resolver_type: spec.resolverType,
        provider: provider.code,
        series_id: spec.seriesId,
        observation_date: spec.observationDate,
        vintage_date: spec.vintageDate ?? null,
        value,
        units: resource.metadata?.units ?? null,
        realtime_start: row.realtime_start ?? null,
        realtime_end: row.realtime_end ?? null,
        operator: spec.operator,
        threshold: spec.threshold,
        revision_handling: 'REQUESTED_VINTAGE_DATE',
      },
    },
  };
}
