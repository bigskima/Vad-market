import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-request-id, x-signature-v2, x-signature, x-timestamp',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

function env(name: string) {
  return Deno.env.get(name)?.trim() || null;
}

function configured() {
  return Boolean(env('DIDIT_API_KEY') && env('DIDIT_WEBHOOK_SECRET') && env('DIDIT_WORKFLOW_ID'));
}

function sortedCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedCanonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortedCanonical(v)]));
  }
  if (typeof value === 'number' && Number.isInteger(value)) return Math.trunc(value);
  return value;
}

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(message: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyDiditWebhook(rawBody: string, parsed: unknown, req: Request) {
  const secret = env('DIDIT_WEBHOOK_SECRET');
  const timestamp = req.headers.get('x-timestamp');
  if (!secret || !timestamp || !/^\d+$/.test(timestamp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const signatureV2 = req.headers.get('x-signature-v2');
  if (signatureV2) {
    const canonical = JSON.stringify(sortedCanonical(parsed));
    const expected = await hmacHex(secret, canonical);
    if (constantTimeEqual(expected.toLowerCase(), signatureV2.toLowerCase())) return true;
  }

  const rawSignature = req.headers.get('x-signature');
  if (rawSignature) {
    const expected = await hmacHex(secret, rawBody);
    if (constantTimeEqual(expected.toLowerCase(), rawSignature.toLowerCase())) return true;
  }
  return false;
}

function clients() {
  const url = env('SUPABASE_URL');
  const anon = env('SUPABASE_ANON_KEY');
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) throw new Error('Supabase runtime credentials unavailable');
  return {
    auth: createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }),
    admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Response(JSON.stringify({ error: 'AUTH_REQUIRED' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const { auth } = clients();
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) throw new Response(JSON.stringify({ error: 'AUTH_INVALID' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  return data.user;
}

async function startKyc(req: Request) {
  if (!configured()) return json({ error: 'KYC_PROVIDER_NOT_CONFIGURED', provider: 'DIDIT' }, 503);
  const user = await requireUser(req);
  const { admin } = clients();
  const { data: prepared, error: prepareError } = await admin.rpc('internal_prepare_kyc_case', { p_user_id: user.id });
  if (prepareError || !prepared) return json({ error: 'KYC_CASE_PREPARE_FAILED', message: prepareError?.message }, 409);

  const body: Record<string, unknown> = {
    workflow_id: env('DIDIT_WORKFLOW_ID'),
    vendor_data: user.id,
    callback_method: 'both',
    metadata: { kyc_case_id: prepared.casePublicId, country_code: prepared.countryCode },
    language: 'en',
  };
  const callback = env('DIDIT_CALLBACK_URL');
  if (callback) body.callback = callback;
  if (user.email) body.contact_details = { email: user.email, send_notification_emails: false, email_lang: 'en' };

  const response = await fetch('https://verification.didit.me/v3/session/', {
    method: 'POST',
    headers: { 'x-api-key': env('DIDIT_API_KEY')!, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Didit create session failed', { status: response.status, casePublicId: prepared.casePublicId });
    return json({ error: 'KYC_PROVIDER_ERROR', provider: 'DIDIT', status: response.status }, response.status >= 500 ? 503 : 422);
  }

  const sessionId = String(payload.session_id ?? '');
  const verificationUrl = String(payload.url ?? '');
  if (!sessionId || !verificationUrl) return json({ error: 'KYC_PROVIDER_INVALID_RESPONSE' }, 502);

  const { error: attachError } = await admin.rpc('internal_attach_kyc_session', {
    p_user_id: user.id,
    p_case_public_id: prepared.casePublicId,
    p_provider_reference: sessionId,
    p_provider_status: String(payload.status ?? 'Not Started'),
  });
  if (attachError) return json({ error: 'KYC_SESSION_ATTACH_FAILED' }, 500);

  return json({ provider: 'DIDIT', casePublicId: prepared.casePublicId, status: payload.status ?? 'Not Started', verificationUrl });
}

async function handleWebhook(req: Request) {
  if (!env('DIDIT_WEBHOOK_SECRET')) return json({ error: 'WEBHOOK_NOT_CONFIGURED' }, 503);
  const rawBody = await req.text();
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody) as Record<string, unknown>; } catch { return json({ error: 'INVALID_JSON' }, 400); }
  if (!(await verifyDiditWebhook(rawBody, payload, req))) return json({ error: 'INVALID_SIGNATURE' }, 401);

  const sessionId = String(payload.session_id ?? '');
  const vendorData = payload.vendor_data == null ? null : String(payload.vendor_data);
  const status = String(payload.status ?? '');
  const eventType = String(payload.webhook_type ?? 'status.updated');
  const eventId = String(payload.event_id ?? `${sessionId}:${eventType}:${payload.timestamp ?? req.headers.get('x-timestamp') ?? ''}`);
  if (!sessionId) return json({ ok: true, ignored: true, reason: 'NO_SESSION_ID' });

  const safeMetadata = {
    webhook_type: eventType,
    workflow_id: payload.workflow_id ?? null,
    session_kind: payload.session_kind ?? 'user',
    provider_status: status,
  };
  const { admin } = clients();
  const { data, error } = await admin.rpc('internal_apply_kyc_webhook', {
    p_provider_code: 'DIDIT',
    p_provider_event_id: eventId,
    p_provider_reference: sessionId,
    p_vendor_data: vendorData,
    p_provider_status: status,
    p_event_type: eventType,
    p_payload_hash: await sha256Hex(rawBody),
    p_safe_metadata: safeMetadata,
  });
  if (error) {
    console.error('Didit webhook apply failed', { sessionId, eventId, message: error.message });
    return json({ error: 'WEBHOOK_APPLY_FAILED' }, 500);
  }
  return json({ ok: true, result: data });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    if (req.method === 'GET' && path.endsWith('/health')) return json({ provider: 'DIDIT', configured: configured(), apiVersion: 'v3' });
    if (req.method === 'POST' && path.endsWith('/webhook')) return await handleWebhook(req);
    if (req.method === 'POST') return await startKyc(req);
    return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('identity-gateway failure', { message: error instanceof Error ? error.message : 'unknown' });
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
