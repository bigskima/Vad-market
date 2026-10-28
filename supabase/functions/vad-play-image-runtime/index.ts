import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

type Rec = Record<string, unknown>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const isRecord = (value: unknown): value is Rec => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value: unknown, max = 1200) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';

function sniffImage(bytes: Uint8Array) {
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (png) return { extension: 'png', contentType: 'image/png' };
  if (jpeg) return { extension: 'jpg', contentType: 'image/jpeg' };
  if (webp) return { extension: 'webp', contentType: 'image/webp' };
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')?.trim();
    const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))?.trim();
    const service = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))?.trim();
    const authorization = req.headers.get('Authorization') ?? '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!url || !anon || !service) return json({ error: 'Image generation service is not configured.' }, 503);
    if (!token) return json({ error: 'Sign in with an authorized Play admin account.' }, 401);

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: 'Your sign-in session is invalid or expired.' }, 401);

    const actor = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: access, error: accessError } = await actor.rpc('admin_my_access');
    const permissions = Array.isArray(access?.permissions) ? access.permissions : [];
    if (accessError || !(permissions.includes('play.manage') || access?.isSuperAdmin === true)) {
      return json({ error: 'The play.manage permission is required to generate game artwork.' }, 403);
    }

    const declaredLength = Number(req.headers.get('content-length') ?? 0);
    if (declaredLength > 16_384) return json({ error: 'Artwork instructions are too large.' }, 413);
    const body = await req.json().catch(() => null);
    if (!isRecord(body)) return json({ error: 'Enter a short game or campaign description first.' }, 400);
    const title = clean(body.title, 180);
    const description = clean(body.description, 800);
    const visualPrompt = clean(body.visualPrompt, 1400);
    const imageType = ['campaign', 'experience', 'sponsor'].includes(clean(body.imageType, 30))
      ? clean(body.imageType, 30)
      : 'campaign';
    if (title.length < 2) return json({ error: 'A game or campaign title is required.' }, 400);

    const { data: provider, error: providerError } = await admin.rpc('get_cloudflare_market_image_provider_runtime');
    if (providerError || !provider || !['ACTIVE', 'DEGRADED'].includes(String(provider.status))) {
      return json({ error: 'The configured Cloudflare image provider is not ready. Check provider settings.' }, 503);
    }
    const accountId = String(provider.public_metadata?.account_id || '').trim();
    const secretName = String(provider.secret_reference || 'VAD_AI_CLOUDFLARE_API_TOKEN').trim();
    const apiToken = Deno.env.get(secretName) || Deno.env.get('CLOUDFLARE_API_TOKEN') || Deno.env.get('CLOUDFLARE_WORKERS_AI_API_TOKEN');
    if (!accountId) return json({ error: 'Cloudflare account ID is missing in provider settings.' }, 503);
    if (!apiToken) return json({ error: 'The configured Cloudflare image-generation secret is missing in Supabase Edge Function secrets.', requiredSecret: secretName }, 503);

    const model = '@cf/black-forest-labs/flux-2-klein-4b';
    const prompt = [
      'Create a high-quality, editorial 16:9 image for a premium dark prediction-market entertainment app. Use a single clear subject, realistic details, cinematic but natural lighting and clean composition for both wide and mobile crops.',
      'Game or campaign context (semantic guidance only): ' + title + '.',
      description ? 'Additional context, not text to render: ' + description + '.' : '',
      visualPrompt ? 'Art direction: ' + visualPrompt + '.' : '',
      'Strictly no text of any kind: no letters, numbers, captions, logos, watermarks, badges, UI, buttons, labels, fake headlines, currency symbols or pseudo-writing. Do not draw the title. If an exact branded asset cannot be depicted reliably, use a neutral thematic illustration. Avoid suggesting guaranteed winnings or financial outcomes.',
    ].filter(Boolean).join(' ');

    const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(accountId) + '/ai/run/' + model;
    const form = new FormData();
    form.set('prompt', prompt);
    form.set('width', '1024');
    form.set('height', '576');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiToken },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) return json({ error: 'The configured AI provider could not generate artwork.', providerStatus: response.status }, 502);
    const payload = await response.json().catch(() => ({}));
    const encoded = String(payload?.result?.image || payload?.image || '').replace(/^data:image\/[^;]+;base64,/i, '').replace(/\s/g, '');
    if (!encoded || encoded.length > 14_000_000) return json({ error: 'The AI provider returned no usable image data.' }, 502);

    let binary: string;
    try { binary = atob(encoded); } catch { return json({ error: 'The AI provider returned an invalid image payload.' }, 502); }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.length > 8 * 1024 * 1024) return json({ error: 'Generated artwork exceeds the 8 MB limit.' }, 413);
    const image = sniffImage(bytes);
    if (!image) return json({ error: 'The AI provider returned an unsupported image format.' }, 502);

    const objectPath = 'campaigns/generated/' + imageType + '-' + crypto.randomUUID() + '.' + image.extension;
    const upload = await admin.storage.from('vad-play-media').upload(objectPath, bytes, {
      contentType: image.contentType,
      cacheControl: '31536000',
      upsert: false,
    });
    if (upload.error) return json({ error: 'Generated artwork could not be saved to VAD Play media storage.' }, 500);

    const publicUrl = admin.storage.from('vad-play-media').getPublicUrl(objectPath).data.publicUrl;
    return json({ ok: true, storagePath: objectPath, publicUrl, imageType, model, generatedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image generation failed unexpectedly.';
    return json({ error: message.slice(0, 500) }, 500);
  }
});
