import { hasContinuousTimestampCoverage } from './coverage.ts';
import { eligibleProviders, parseResolverSpec } from './resolvers.ts';
import type { DueOracleEvent, OracleProvider } from './types.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function eventFixture(overrides: Partial<DueOracleEvent> = {}): DueOracleEvent {
  return {
    eventId: 101,
    eventPublicId: 'VAD-TEST-FX-1',
    title: 'Will USD/JPY be at or above 150 at the observation time?',
    category: 'FX',
    status: 'AWAITING_ORACLE',
    normalizedParameters: {},
    resolutionScope: {
      resolver_type: 'FINANCIAL_PRICE_THRESHOLD_V1',
      symbol: 'USD/JPY',
      operator: 'GTE',
      threshold: 150,
      observation_time: '2026-10-22T12:00:00.000Z',
    },
    closesAt: '2026-10-22T11:00:00.000Z',
    resolvesAfter: '2026-10-22T12:00:00.000Z',
    oraclePolicyId: 10,
    oraclePolicyPublicId: 'POLICY-TEST',
    capabilityCode: 'FINANCIAL_PRICE_THRESHOLD',
    sourceHierarchy: ['TWELVE_DATA'],
    consensusRule: { min_agreeing_providers: 2 },
    outcomes: [{ code: 'YES', label: 'Yes' }, { code: 'NO', label: 'No' }],
    ...overrides,
  };
}

function providerFixture(overrides: Partial<OracleProvider> = {}): OracleProvider {
  return {
    id: 20,
    code: 'TWELVE_DATA',
    name: 'Twelve Data',
    environment: 'PRODUCTION',
    status: 'ACTIVE',
    healthStatus: 'UNKNOWN',
    priority: 30,
    capabilities: ['FINANCIAL_PRICE_THRESHOLD'],
    configured: true,
    adapter: 'TWELVE_DATA_HISTORICAL_V1',
    baseUrl: 'https://api.twelvedata.com',
    secretReference: 'TWELVE_DATA_API_KEY',
    publicMetadata: {},
    resources: [],
    ...overrides,
  };
}

Deno.test('financial resolver derives JPY from a canonical USD/JPY pair', () => {
  const spec = parseResolverSpec(eventFixture());
  assert(spec.resolverType === 'FINANCIAL_PRICE_THRESHOLD_V1', 'expected a financial-price resolver');
  assert(spec.symbol === 'USD', 'expected base symbol USD');
  assert(spec.quote === 'JPY', 'expected pair quote JPY, not the USD default');
});

Deno.test('provider selection fails closed when policy source codes do not match registered providers', () => {
  const event = eventFixture({ sourceHierarchy: ['UNREGISTERED_PROVIDER'] });
  const spec = parseResolverSpec(event);
  const eligible = eligibleProviders(event, spec, [providerFixture()]);
  assert(eligible.length === 0, 'a nonmatching explicit policy hierarchy must not allow arbitrary providers');
});

Deno.test('provider selection respects the approved source hierarchy and provider readiness', () => {
  const event = eventFixture({
    sourceHierarchy: ['TWELVE_DATA', 'ALPHA_VANTAGE', 'UNAVAILABLE_SOURCE', 'NOT_CONFIGURED', 'SANDBOX_SOURCE'],
  });
  const spec = parseResolverSpec(event);
  const providers = [
    providerFixture(),
    providerFixture({ id: 21, code: 'ALPHA_VANTAGE', status: 'DISABLED', capabilities: ['FINANCIAL_PRICE_THRESHOLD'] }),
    providerFixture({ id: 22, code: 'UNAVAILABLE_SOURCE', healthStatus: 'UNAVAILABLE' }),
    providerFixture({ id: 23, code: 'NOT_CONFIGURED', configured: false }),
    providerFixture({ id: 24, code: 'SANDBOX_SOURCE', environment: 'SANDBOX' }),
  ];
  const eligible = eligibleProviders(event, spec, providers);
  assert(eligible.length === 1 && eligible[0].code === 'TWELVE_DATA', 'only a configured, production, healthy-or-unknown provider in the approved hierarchy should be eligible');
});

Deno.test('negative threshold-touch evidence rejects a hidden gap between boundary samples', () => {
  const start = Date.UTC(2026, 9, 22, 0, 0, 0);
  const end = start + 60 * 60 * 1000;
  const sparsePoints = [start + 60_000, end - 60_000];
  assert(
    !hasContinuousTimestampCoverage(sparsePoints, start, end, 900),
    'boundary samples do not prove coverage when the internal gap exceeds the maximum',
  );
});

Deno.test('continuous historical samples satisfy the configured coverage gap', () => {
  const start = Date.UTC(2026, 9, 22, 0, 0, 0);
  const points = [start, start + 10 * 60_000, start + 20 * 60_000, start + 30 * 60_000];
  assert(
    hasContinuousTimestampCoverage(points, start, start + 30 * 60_000, 900),
    'all sample gaps are within the configured maximum',
  );
});

Deno.test('keyless Coinbase public candles can be eligible under an approved policy', () => {
  const event = eventFixture({ sourceHierarchy: ['COINBASE'] });
  const spec = parseResolverSpec(event);
  const coinbase = providerFixture({
    id: 30,
    code: 'COINBASE',
    name: 'Coinbase Public Market Data',
    configured: true,
    secretReference: null,
    adapter: 'COINBASE_PUBLIC_CANDLES_V1',
    baseUrl: 'https://api.coinbase.com',
    capabilities: ['CRYPTO_PRICE_THRESHOLD', 'FINANCIAL_PRICE_THRESHOLD'],
  });
  const eligible = eligibleProviders(event, spec, [coinbase]);
  assert(eligible.length === 1 && eligible[0].code === 'COINBASE', 'keyless public market-data provider should not be excluded for missing an API key');
});


Deno.test('free crypto settlement policy uses CoinGecko and keyless Coinbase, not paid Pyth', () => {
  const event = eventFixture({
    category: 'CRYPTO_WEB3',
    resolutionScope: {
      resolver_type: 'CRYPTO_PRICE_TOUCH_THRESHOLD_V1',
      asset: 'BTC',
      quote: 'USD',
      operator: 'GTE',
      threshold: 90_000,
      window_start: '2026-10-20T00:00:00.000Z',
      window_end: '2026-10-21T00:00:00.000Z',
    },
    sourceHierarchy: [
      { role: 'PRIMARY', provider_code: 'COINGECKO', priority: 10 },
      { role: 'CORROBORATING', provider_code: 'COINBASE', priority: 20 },
    ],
    consensusRule: { min_agreeing_providers: 2, distinct_providers: true },
  });
  const spec = parseResolverSpec(event);
  const coinGecko = providerFixture({
    id: 31,
    code: 'COINGECKO',
    name: 'CoinGecko Demo API',
    configured: true,
    secretReference: 'COINGECKO_DEMO_API_KEY',
    adapter: 'COINGECKO_MARKET_CHART',
    baseUrl: 'https://api.coingecko.com/api/v3',
    capabilities: ['CRYPTO_PRICE_THRESHOLD'],
  });
  const coinbase = providerFixture({
    id: 32,
    code: 'COINBASE',
    name: 'Coinbase Public Market Data',
    configured: true,
    secretReference: null,
    adapter: 'COINBASE_PUBLIC_CANDLES_V1',
    baseUrl: 'https://api.coinbase.com',
    capabilities: ['CRYPTO_PRICE_THRESHOLD', 'FINANCIAL_PRICE_THRESHOLD'],
  });
  const pyth = providerFixture({
    id: 33,
    code: 'PYTH',
    name: 'Pyth Paid API',
    configured: true,
    capabilities: ['CRYPTO_PRICE_THRESHOLD'],
  });
  const eligible = eligibleProviders(event, spec, [pyth, coinbase, coinGecko]);
  assert(
    eligible.length === 2 && eligible[0].code === 'COINGECKO' && eligible[1].code === 'COINBASE',
    'the approved free hierarchy must select the two independent free sources in priority order and exclude Pyth',
  );
});
