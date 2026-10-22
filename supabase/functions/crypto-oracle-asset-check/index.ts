import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function safeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
type Resource = { canonicalKey: string; externalKey: string; status: string; resourceType: string };
type Provider = {
  code: string; environment: string; status: string; capabilities: unknown[];
  secretReference?: string | null; baseUrl?: string | null; resources?: Resource[];
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const token = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey || !token) {
    return json({ error: 'Authentication and Supabase configuration are required.' }, 401);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userError } = await service.auth.getUser(token);
  if (userError || !userResult.user) return json({ error: 'Authentication required.' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { error: permissionError } = await userClient.rpc('admin_guided_market_catalog');
  if (permissionError) return json({ error: 'Market management permission is required to inspect Oracle asset coverage.' }, 403);

  let body: Record<string, unknown>;
  try {
    const value = await req.json();
    if (!isRecord(value)) return json({ error: 'Invalid request body.' }, 400);
    body = value;
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const symbol = safeText(body.symbol).toUpperCase();
  const quote = safeText(body.quote || 'USD').toUpperCase();
  const requestedCoinGeckoId = safeText(body.coinGeckoId).toLowerCase();
  if (!/^[A-Z0-9]{2,20}$/.test(symbol) || quote !== 'USD') {
    return json({ error: 'Choose a valid crypto ticker and USD quote.' }, 400);
  }

  // Use two no-key historical sources. A CoinGecko ID is carried from the
  // search catalogue for market context only; it is not a settlement dependency.
  const { data: catalogData, error: catalogError } = await service.rpc('internal_oracle_provider_catalog');
  if (catalogError) return json({ error: 'The approved Oracle provider catalog could not be loaded.' }, 503);
  const providers = Array.isArray(catalogData) ? catalogData as Provider[] : [];
  const getProvider = (code: string) => providers.find((row) =>
    safeText(row.code).toUpperCase() === code
      && safeText(row.environment).toUpperCase() === 'PRODUCTION'
      && ['ACTIVE', 'DEGRADED'].includes(safeText(row.status).toUpperCase())
      && Array.isArray(row.capabilities)
      && row.capabilities.some((capability: unknown) => safeText(capability).toUpperCase() === 'CRYPTO_PRICE_THRESHOLD')
  );
  const coinbase = getProvider('COINBASE');
  const kraken = getProvider('KRAKEN');
  const canonicalKey = `${symbol}/${quote}`;
  const activeResource = (provider: Provider | undefined) =>
    provider?.resources?.find((resource) =>
      safeText(resource.resourceType).toUpperCase() === 'CRYPTO_PAIR'
        && safeText(resource.canonicalKey).toUpperCase() === canonicalKey
        && safeText(resource.status).toUpperCase() === 'ACTIVE'
    );
  const coinbaseResource = activeResource(coinbase);
  const krakenResource = activeResource(kraken);
  const coinbaseReady = Boolean(coinbase && coinbase.baseUrl === 'https://api.coinbase.com' && coinbaseResource);
  const krakenReady = Boolean(kraken && kraken.baseUrl === 'https://api.kraken.com' && krakenResource);
  const coinGeckoId = requestedCoinGeckoId || null;
  const supported = coinbaseReady && krakenReady;

  return json({
    supported,
    symbol,
    quote: 'USD',
    provider: 'COINBASE+KRAKEN',
    coinGeckoId,
    ...(supported ? {} : {
      reason: !coinbaseReady
        ? `Coinbase has no active keyless historical-price mapping for ${symbol}/USD.`
        : `Kraken has no active keyless historical-price mapping for ${symbol}/USD.`,
    }),
  });
});
