import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

type IpInfo = {
  country_code?: string;
  privacy?: {
    is_vpn?: boolean;
    is_proxy?: boolean;
    is_tor?: boolean;
    is_hosting?: boolean;
    is_icloud_relay?: boolean;
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '');

  if (!supabaseUrl || !serviceKey || !anonKey || !token) {
    return json({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, 401);

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

  // Use a proxy-injected client IP only; never accept an IP address from the request body.
  const forwardedFor = req.headers.get('x-forwarded-for');
  const forwardedClientIp = forwardedFor?.split(',').map((value) => value.trim()).filter(Boolean).at(-1);
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || forwardedClientIp;
  if (!ip) return json({ error: 'Unable to verify network location', code: 'CLIENT_IP_UNAVAILABLE' }, 503);

  try {
    const [geoResponse, ipResponse] = await Promise.all([
      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=3&addressdetails=1`,
        { headers: { 'User-Agent': 'VADMarket/1.0 location-jurisdiction-check' } },
      ),
      fetch(`https://iplocate.io/api/lookup/${encodeURIComponent(ip)}?include=country_code,privacy.is_vpn,privacy.is_proxy,privacy.is_tor,privacy.is_hosting,privacy.is_icloud_relay`),
    ]);

    if (!geoResponse.ok || !ipResponse.ok) {
      return json({ error: 'Location verification provider unavailable', code: 'LOCATION_PROVIDER_ERROR' }, 503);
    }
    const geo = await geoResponse.json();
    const ipInfo = await ipResponse.json() as IpInfo;
    const privacy = ipInfo.privacy;
    const deviceCountry = String(geo?.address?.country_code || '').toUpperCase();
    const ipCountry = String(ipInfo.country_code || '').toUpperCase();
    if (!deviceCountry || !ipCountry) {
      return json({ error: 'Unable to establish current country', code: 'COUNTRY_UNRESOLVED' }, 503);
    }

    const vpn = privacy?.is_vpn === true || privacy?.is_icloud_relay === true;
    const proxy = privacy?.is_proxy === true;
    const tor = privacy?.is_tor === true;
    const hosting = privacy?.is_hosting === true;
    const riskDetected = vpn || proxy || tor || hosting;
    const { data: account } = await admin
      .from('user_accounts')
      .select('country_code')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    const accountCountry = String(account?.country_code || '').toUpperCase();

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
    if (saveError) return json({ error: 'Could not save location verification', code: 'LOCATION_SAVE_FAILED' }, 500);

    return json({
      allowed: decision === 'VERIFIED',
      reasonCode,
      deviceCountry,
      ipCountry,
      expiresAt: expiresAt.toISOString(),
    }, decision === 'VERIFIED' ? 200 : 403);
  } catch {
    return json({ error: 'Location verification is temporarily unavailable', code: 'LOCATION_CHECK_FAILED' }, 503);
  }
});
