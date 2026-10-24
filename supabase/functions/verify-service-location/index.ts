import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

type NetworkLookupResult = {
  success?: unknown;
  data?: {
    ip?: unknown;
    location?: {
      countryCode?: unknown;
    };
    security?: {
      isVpn?: unknown;
      isProxy?: unknown;
      isTor?: unknown;
      isHosting?: unknown;
      isBlacklisted?: unknown;
    };
  };
};

function isCountryCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z]{2}$/.test(value.trim());
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 5000,
) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '');

  if (!supabaseUrl || !serviceKey || !token) {
    return json({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return json({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, 401);
  }

  let input: { latitude?: unknown; longitude?: unknown; accuracyMeters?: unknown };
  try {
    input = await req.json();
  } catch {
    return json({ error: 'A current device location is required', code: 'LOCATION_REQUIRED' }, 400);
  }

  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const accuracyMeters = Number(input.accuracyMeters);
  if (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 1500
  ) {
    return json({ error: 'Location is missing or too imprecise', code: 'LOCATION_INACCURATE' }, 400);
  }

  // Read the client IP from trusted proxy headers only. Do not accept a client-
  // supplied IP or location-derived country as proof of network jurisdiction.
  const forwardedFor = req.headers.get('x-forwarded-for');
  const forwardedClientIp = forwardedFor?.split(',').map((value) => value.trim()).filter(Boolean).at(-1);
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || forwardedClientIp;
  if (!ip) {
    return json({ error: 'Unable to verify network location', code: 'CLIENT_IP_UNAVAILABLE' }, 503);
  }

  try {
    // The prior IPLogs endpoint repeatedly timed out from Supabase Edge (the
    // function logs showed networkProviderFailed=true after the 7-second abort).
    // Use whatismyip.ai's documented keyless lookup: it returns country and all
    // four required network-risk flags in one request, without a slow active probe.
    const [geoResult, networkResult] = await Promise.allSettled([
      fetchWithTimeout(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=3&addressdetails=1`,
        { headers: { 'User-Agent': 'VADMarket/1.0 location-jurisdiction-check' } },
        7000,
      ),
      fetchWithTimeout(
        `https://whatismyip.ai/api/lookup/${encodeURIComponent(ip)}`,
        { headers: { 'Accept': 'application/json' } },
        5000,
      ),
    ]);

    if (geoResult.status === 'rejected' || networkResult.status === 'rejected') {
      console.warn('[verify-service-location] country or network provider request failed', {
        countryProviderFailed: geoResult.status === 'rejected',
        networkProviderFailed: networkResult.status === 'rejected',
      });
      return json({ error: 'Location verification provider unavailable', code: 'LOCATION_PROVIDER_ERROR' }, 503);
    }

    const geoResponse = geoResult.value;
    const networkResponse = networkResult.value;
    if (!geoResponse.ok || !networkResponse.ok) {
      console.warn('[verify-service-location] country or network provider returned non-2xx', {
        countryProviderStatus: geoResponse.status,
        networkProviderStatus: networkResponse.status,
      });
      return json({ error: 'Location verification provider unavailable', code: 'LOCATION_PROVIDER_ERROR' }, 503);
    }

    const geo = await geoResponse.json();
    const network = await networkResponse.json() as NetworkLookupResult;
    const networkData = network.data;
    const security = networkData?.security;

    // Fail closed if any of the provider's security flags are absent. Never
    // substitute the device GPS country for the client's network country.
    const networkSignalsComplete =
      network.success === true &&
      isCountryCode(networkData?.location?.countryCode) &&
      typeof security?.isVpn === 'boolean' &&
      typeof security?.isProxy === 'boolean' &&
      typeof security?.isTor === 'boolean' &&
      typeof security?.isHosting === 'boolean' &&
      typeof security?.isBlacklisted === 'boolean';

    if (!networkSignalsComplete) {
      console.warn('[verify-service-location] network provider response lacked required country or risk signals');
      return json({ error: 'Network risk signals are unavailable', code: 'NETWORK_RISK_UNRESOLVED' }, 503);
    }

    const deviceCountry = String(geo?.address?.country_code || '').trim().toUpperCase();
    const ipCountry = String(networkData?.location?.countryCode || '').trim().toUpperCase();
    if (!isCountryCode(deviceCountry) || !isCountryCode(ipCountry)) {
      return json({ error: 'Unable to establish current country', code: 'COUNTRY_UNRESOLVED' }, 503);
    }

    const vpn = security?.isVpn === true;
    const proxy = security?.isProxy === true;
    const tor = security?.isTor === true;
    const hosting = security?.isHosting === true;
    const blacklisted = security?.isBlacklisted === true;
    const riskDetected = vpn || proxy || tor || hosting || blacklisted;

    const { data: account, error: accountError } = await admin
      .from('user_accounts')
      .select('country_code')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (accountError) {
      console.warn('[verify-service-location] account country lookup failed');
      return json({ error: 'Could not verify the account country', code: 'ACCOUNT_COUNTRY_LOOKUP_FAILED' }, 503);
    }

    let accountCountry = String(account?.country_code || '').trim().toUpperCase();

    // Normalize common Nigeria aliases written by older onboarding clients. These
    // values identify the same declared jurisdiction; live GPS and network checks
    // must still pass before any NGN action is authorized.
    if (['NG', 'NGA', 'NIGERIA'].includes(accountCountry) && accountCountry !== 'NG') {
      const { data: normalizedAccount, error: normalizeError } = await admin
        .from('user_accounts')
        .update({ country_code: 'NG' })
        .eq('user_id', authData.user.id)
        .eq('country_code', account?.country_code)
        .select('country_code')
        .maybeSingle();
      if (!normalizeError && normalizedAccount?.country_code === 'NG') accountCountry = 'NG';
    }

    // Repair an unset country only when GPS and the IP provider both resolve to
    // Nigeria with a clean network result. Compare against the old value so a
    // concurrent explicit country change is preserved.
    if (!accountCountry && deviceCountry === 'NG' && ipCountry === 'NG' && !riskDetected) {
      let countryUpdate = admin
        .from('user_accounts')
        .update({ country_code: 'NG' })
        .eq('user_id', authData.user.id);
      countryUpdate = account?.country_code == null
        ? countryUpdate.is('country_code', null)
        : countryUpdate.eq('country_code', account.country_code);
      const { data: updatedAccount, error: countryUpdateError } = await countryUpdate
        .select('country_code')
        .maybeSingle();
      if (!countryUpdateError && updatedAccount?.country_code === 'NG') accountCountry = 'NG';
    }

    let decision: 'VERIFIED' | 'DENIED' | 'REVIEW' = 'DENIED';
    let reasonCode = 'ACCOUNT_NOT_ELIGIBLE';
    if (accountCountry === 'NG' && deviceCountry === 'NG' && ipCountry === 'NG' && !riskDetected) {
      decision = 'VERIFIED';
      reasonCode = 'ALLOWED';
    } else if (deviceCountry !== ipCountry) {
      reasonCode = 'LOCATION_MISMATCH';
    } else if (deviceCountry !== 'NG' || ipCountry !== 'NG') {
      reasonCode = 'OUTSIDE_NIGERIA';
    } else if (riskDetected) {
      reasonCode = 'NETWORK_RISK';
    }

    const checkedAt = new Date();
    const expiresAt = new Date(checkedAt.getTime() + 2 * 60 * 1000);
    const { error: saveError } = await admin.from('user_location_verifications').upsert({
      user_id: authData.user.id,
      device_country_code: deviceCountry,
      ip_country_code: ipCountry,
      decision,
      reason_code: reasonCode,
      vpn_detected: vpn,
      proxy_detected: proxy,
      tor_detected: tor,
      hosting_detected: hosting,
      checked_at: checkedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      updated_at: checkedAt.toISOString(),
    }, { onConflict: 'user_id' });
    if (saveError) {
      console.warn('[verify-service-location] could not save verification record');
      return json({ error: 'Could not save location verification', code: 'LOCATION_SAVE_FAILED' }, 500);
    }

    return json({
      allowed: decision === 'VERIFIED',
      reasonCode,
      deviceCountry,
      ipCountry,
      expiresAt: expiresAt.toISOString(),
    }, decision === 'VERIFIED' ? 200 : 403);
  } catch {
    // Never log raw IP addresses or coordinates; expose a stable diagnostic code.
    console.warn('[verify-service-location] unhandled verification failure');
    return json({ error: 'Location verification is temporarily unavailable', code: 'LOCATION_CHECK_FAILED' }, 503);
  }
});
