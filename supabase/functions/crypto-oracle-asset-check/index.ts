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
async function fetchJson(url: string, token: string | null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(response.status === 401 || response.status === 403
        ? 'The configured Pyth credentials are not accepted by the provider.'
        : `Pyth feed discovery returned HTTP ${response.status}.`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey || !token) {
    return json({ error: 'Authentication and Supabase configuration are required.' }, 401);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userError } = await service.auth.getUser(token);
  if (userError || !userResult.user) return json({ error: 'Authentication required.' }, 401);

  // Call the same permission-guarded RPC that powers the admin creation workspace.
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
  if (!/^[A-Z0-9]{2,20}$/.test(symbol) || quote !== 'USD') {
    return json({ error: 'Choose a valid crypto ticker and USD quote.' }, 400);
  }

  const { data: providersData, error: providersError } = await service.rpc('internal_oracle_provider_catalog');
  if (providersError) return json({ error: 'The approved Oracle provider catalog could not be loaded.' }, 503);
  const providers = Array.isArray(providersData) ? providersData : [];
  const pyth = providers.find((row: unknown) => isRecord(row)
    && safeText(row.code).toUpperCase() === 'PYTH'
    && safeText(row.environment).toUpperCase() === 'PRODUCTION'
    && ['ACTIVE', 'DEGRADED'].includes(safeText(row.status).toUpperCase())
    && Array.isArray(row.capabilities)
    && row.capabilities.some((capability: unknown) => safeText(capability).toUpperCase() === 'CRYPTO_PRICE_THRESHOLD'));
  if (!isRecord(pyth)) return json({ error: 'Pyth historical crypto resolution is not enabled.' }, 503);

  const baseUrl = safeText(pyth.baseUrl).replace(/\/$/, '');
  const secretName = safeText(pyth.secretReference);
  const apiToken = secretName ? Deno.env.get(secretName) ?? '' : '';
  if (!baseUrl || !secretName || !apiToken) {
    return json({ error: 'The Pyth source is not fully configured for Oracle resolution.' }, 503);
  }

  const feedUrl = new URL(`${baseUrl}/v2/price_feeds`);
  feedUrl.searchParams.set('query', symbol);
  feedUrl.searchParams.set('asset_type', 'crypto');
  try {
    const payload = await fetchJson(feedUrl.toString(), apiToken);
    if (!Array.isArray(payload)) return json({ error: 'Pyth returned an invalid feed catalogue.' }, 502);
    const expected = `CRYPTO.${symbol}/USD`.toUpperCase();
    const exact = payload.find((entry: unknown) => {
      if (!isRecord(entry) || !isRecord(entry.attributes)) return false;
      return safeText(entry.attributes.symbol).toUpperCase() === expected;
    });
    if (!isRecord(exact) || !safeText(exact.id)) {
      return json({
        supported: false,
        symbol,
        quote: 'USD',
        provider: 'PYTH',
        reason: `Pyth has no exact ${symbol}/USD crypto feed. Choose another asset or configure an approved resolver mapping before publishing.`,
      });
    }

    return json({
      supported: true,
      symbol,
      quote: 'USD',
      provider: 'PYTH',
      feedSymbol: safeText((exact.attributes as Record<string, unknown>).symbol),
      feedId: safeText(exact.id).replace(/^0x/i, ''),
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Pyth feed discovery failed.',
    }, 502);
  }
});
