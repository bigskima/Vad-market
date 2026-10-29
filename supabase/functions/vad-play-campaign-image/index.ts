import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const clean = (value: unknown, max = 1200) => typeof value === 'string'
  ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const authorization = req.headers.get('Authorization') ?? '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    const url = Deno.env.get('SUPABASE_URL')?.trim();
    const service = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))?.trim();
    const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))?.trim();
    if (!url || !service || !anon) return json({ error: 'SERVICE_UNAVAILABLE', message: 'The Play artwork service is not configured.' }, 503);
    if (!token) return json({ error: 'AUTH_REQUIRED', message: 'Sign in as an authorized VAD Play administrator.' }, 401);

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: 'AUTH_INVALID', message: 'Your sign-in session is invalid or expired.' }, 401);
    const actor = createClient(url, anon, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: access, error: accessError } = await actor.rpc('admin_my_access');
    const accessRecord = isRecord(access) ? access : {};
    const permissions = Array.isArray(accessRecord.permissions) ? accessRecord.permissions : [];
    if (accessError || !(permissions.includes('play.manage') || accessRecord.isSuperAdmin === true)) {
      return json({ error: 'PLAY_PERMISSION_REQUIRED', message: 'The play.manage permission is required to generate artwork.' }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'INVALID_BODY', message: 'A game title is required.' }, 400);
    const title = clean(body.title, 120);
    const prizeTitle = clean(body.prizeTitle, 180);
    const visualDirection = clean(body.visualDirection, 1200);
    if (title.length < 3) return json({ error: 'TITLE_REQUIRED', message: 'Enter a game title before generating artwork.' }, 400);

    const { data: provider, error: providerError } = await admin.rpc('get_cloudflare_market_image_provider_runtime');
    if (providerError || !provider || !['ACTIVE', 'DEGRADED'].includes(String(provider.status))) {
      return json({ error: 'IMAGE_PROVIDER_UNAVAILABLE', message: 'Cloudflare Workers AI is not currently available in the VAD provider settings.' }, 503);
    }
    const accountId = String(provider.public_metadata?.account_id || '').trim();
    const secretName = String(provider.secret_reference || 'VAD_AI_CLOUDFLARE_API_TOKEN').trim();
    const apiToken = Deno.env.get(secretName) || Deno.env.get('CLOUDFLARE_API_TOKEN') || Deno.env.get('CLOUDFLARE_WORKERS_AI_API_TOKEN');
    if (!accountId) return json({ error: 'IMAGE_ACCOUNT_MISSING', message: 'The active image provider has no account ID configured.' }, 503);
    if (!apiToken) return json({ error: 'IMAGE_SECRET_MISSING', message: 'The configured Cloudflare API token is missing from Edge Function secrets.', requiredSecret: secretName }, 503);

    const model = '@cf/black-forest-labs/flux-2-klein-4b';
    const prompt = [
      'Create a premium editorial 16:9 image cover for a game/campaign inside a dark modern entertainment app. Compose edge-to-edge with a single clear focal subject, tactile details, cinematic but natural lighting and phone-friendly crop.',
      `Game idea for semantic guidance only (never reproduce text): ${title}.`,
      prizeTitle ? `Prize visual guidance only (never write these words): ${prizeTitle}.` : '',
      visualDirection ? `Style guidance only: ${visualDirection}.` : '',
      'ABSOLUTE TEXT-FREE REQUIREMENT: no text, letters, numbers, logos, ticker symbols, captions, labels, badges, UI, watermarks, signs or pseudo-writing. If a specific subject cannot be depicted accurately without branding, use tasteful generic editorial imagery. Never depict guaranteed winnings, cash notes, or promises of returns.',
    ].filter(Boolean).join(' ');

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;
    const form = new FormData();
    form.set('prompt', prompt);
    form.set('width', '1024');
    form.set('height', '576');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}` },
      body: form,
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      console.warn('Cloudflare Play image provider returned HTTP', response.status);
      return json({ error: 'IMAGE_GENERATION_FAILED', message: 'The configured image provider could not generate artwork. Check the provider credentials and retry.' }, 502);
    }
    const payload = await response.json().catch(() => ({}));
    const encoded = String(payload?.result?.image || payload?.image || '').replace(/^data:image\/[^;]+;base64,/i, '').replace(/\s/g, '');
    if (!encoded || encoded.length > 14_000_000) return json({ error: 'IMAGE_PAYLOAD_INVALID', message: 'The image provider returned no usable image.' }, 502);
    let binary: string;
    try { binary = atob(encoded); } catch { return json({ error: 'IMAGE_PAYLOAD_INVALID', message: 'The generated image could not be decoded.' }, 502); }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isWebp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (!isPng && !isJpeg && !isWebp) return json({ error: 'IMAGE_FORMAT_UNSUPPORTED', message: 'The generated image format is not supported.' }, 502);
    const extension = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
    const contentType = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
    const mediaPath = `generated/${authData.user.id}/campaign-${crypto.randomUUID()}.${extension}`;
    const upload = await admin.storage.from('play-media').upload(mediaPath, bytes, {
      contentType,
      cacheControl: '31536000',
      upsert: false,
    });
    if (upload.error) return json({ error: 'IMAGE_STORAGE_FAILED', message: 'Generated artwork could not be saved to Play media storage.' }, 500);
    return json({ mediaPath, model, generatedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Artwork generation failed unexpectedly.';
    return json({ error: 'PLAY_IMAGE_FAILED', message }, 500);
  }
});
