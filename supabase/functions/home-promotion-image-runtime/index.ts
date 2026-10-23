import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const authorization = req.headers.get('Authorization') ?? '';
    const token = authorization.replace(/^Bearer\s+/i, '');

    if (!supabaseUrl || !serviceKey || !anonKey || !token) {
      return json({ error: 'Sign in with an authorized VAD admin account to generate campaign artwork.' }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return json({ error: 'Your sign-in session is invalid or expired.' }, 401);
    }

    // Evaluate the current user's server-side permission using their JWT. The
    // service-role client is used only for provider secrets and media storage.
    const actor = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: access, error: accessError } = await actor.rpc('admin_my_access');
    const permissions = Array.isArray(access?.permissions) ? access.permissions : [];
    if (accessError || !(permissions.includes('content.moderate') || access?.isSuperAdmin === true)) {
      return json({ error: 'The content.moderate permission is required to generate Home campaign artwork.' }, 403);
    }

    const declaredLength = Number(req.headers.get('content-length') ?? 0);
    if (declaredLength > 16_384) {
      return json({ error: 'Campaign artwork instructions are too large.' }, 413);
    }
    const requestBody = await req.json().catch(() => null);
    if (!requestBody || typeof requestBody !== 'object') {
      return json({ error: 'A campaign title is required.' }, 400);
    }
    const title = clean(requestBody.title, 120);
    const body = clean(requestBody.body, 320);
    const visualDirection = clean(requestBody.visualDirection, 1200);
    if (title.length < 3) return json({ error: 'Add a campaign title of at least 3 characters.' }, 400);

    const { data: provider, error: providerError } = await admin
      .schema('integration')
      .from('providers')
      .select('secret_reference, public_metadata')
      .eq('code', 'CLOUDFLARE_WORKERS_AI')
      .eq('environment', 'PRODUCTION')
      .in('status', ['ACTIVE', 'DEGRADED'])
      .maybeSingle();

    if (providerError) return json({ error: 'The configured image provider could not be checked.' }, 503);
    const accountId = String(provider?.public_metadata?.account_id || '').trim();
    const secretName = String(provider?.secret_reference || 'VAD_AI_CLOUDFLARE_API_TOKEN').trim();
    const apiToken = Deno.env.get(secretName);
    if (!accountId || !apiToken) {
      return json({ error: 'AI image generation is not configured. Check the active Cloudflare Workers AI provider and its server secret.' }, 503);
    }

    const model = Deno.env.get('CLOUDFLARE_IMAGE_MODEL') || '@cf/black-forest-labs/flux-1-schnell';
    const prompt = [
      'Create a premium, cinematic, wide landscape campaign image for VAD Market, a real-world prediction markets platform.',
      'Compose a sophisticated 16:9 promotional banner that feels editorial, modern, polished, and suitable for a dark indigo mobile app.',
      `Campaign theme: ${title}.`,
      body ? `Supporting context: ${body}.` : '',
      visualDirection ? `Creative direction: ${visualDirection}.` : '',
      'Infer relevant visual subject matter from the campaign theme. Use clear visual hierarchy, vivid but controlled color, crisp details, dimensional lighting, and strong composition that remains legible when cropped on a phone.',
      'Artwork only: no text, no letters, no words, no numbers, no typography, no buttons, no interface mockup, no watermark, and no logos.',
    ].filter(Boolean).join(' ');

    const aiResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, steps: 4 }),
      },
    );

    if (!aiResponse.ok) {
      return json({ error: 'The configured AI provider could not generate the campaign image.', providerStatus: aiResponse.status }, 502);
    }

    const payload = await aiResponse.json();
    const base64 = String(payload?.result?.image || payload?.image || '');
    if (!base64) return json({ error: 'The AI provider returned no image data.' }, 502);
    if (base64.length > 14_000_000) return json({ error: 'The generated image was larger than the allowed storage limit.' }, 502);

    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const objectPath = `banners/ai/${crypto.randomUUID()}.jpg`;
    const upload = await admin.storage.from('home-promotions').upload(objectPath, bytes, {
      contentType: 'image/jpeg',
      upsert: false,
      cacheControl: '31536000',
    });
    if (upload.error) {
      return json({ error: 'Generated campaign artwork could not be saved to Home media storage.' }, 500);
    }

    const imageUrl = admin.storage.from('home-promotions').getPublicUrl(objectPath).data.publicUrl;
    if (!imageUrl.startsWith('https://')) return json({ error: 'Generated image URL is not a secure HTTPS URL.' }, 500);

    return json({
      imageUrl,
      generatedAt: new Date().toISOString(),
      model,
      cached: false,
    });
  } catch {
    return json({ error: 'Campaign artwork generation is temporarily unavailable. Please retry.' }, 500);
  }
});
