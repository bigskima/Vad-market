import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const DAY_MS = 24 * 60 * 60 * 1000;
const HERO_PATH = 'generated/home-hero/daily-hero.jpg';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const authorization = req.headers.get('Authorization') ?? '';
    const token = authorization.replace(/^Bearer\s+/i, '');

    if (!supabaseUrl || !serviceKey || !anonKey || !token) {
      return json({ error: 'Authentication required' }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: 'Authentication required' }, 401);

    const readCached = async () => {
      const { data, error } = await admin
        .from('home_hero_assets')
        .select('image_url, generated_at, expires_at')
        .eq('slot', 'HOME')
        .maybeSingle();
      if (error || !data) return null;
      return {
        imageUrl: data.image_url as string,
        generatedAt: data.generated_at as string,
        expiresAt: data.expires_at as string,
      };
    };

    const cached = await readCached();
    if (cached && Date.parse(cached.expiresAt) > Date.now()) {
      return json({ ...cached, cached: true });
    }

    // Use the public, privileged provider-runtime RPC. The integration schema is
    // intentionally not exposed through PostgREST, so querying it directly caused
    // intermittent 503s on Home artwork despite a healthy Cloudflare setup.
    const { data: provider, error: providerError } = await admin
      .rpc('get_cloudflare_market_image_provider_runtime');
    if (providerError || !provider || !['ACTIVE', 'DEGRADED'].includes(String(provider.status))) {
      if (cached) return json({ ...cached, cached: true, stale: true });
      return json({
        error: 'Cloudflare Workers AI provider configuration could not be loaded. Check the active provider settings.',
        code: 'CLOUDFLARE_PROVIDER_CONFIG_UNAVAILABLE',
      }, 503);
    }

    const accountId = String(provider?.public_metadata?.account_id || '').trim();
    const secretName = String(provider?.secret_reference || 'VAD_AI_CLOUDFLARE_API_TOKEN').trim();
    const apiToken = Deno.env.get(secretName) || Deno.env.get('CLOUDFLARE_API_TOKEN') || Deno.env.get('CLOUDFLARE_WORKERS_AI_API_TOKEN');

    if (!accountId) {
      if (cached) return json({ ...cached, cached: true, stale: true });
      return json({ error: 'Cloudflare Workers AI account ID is missing from the provider configuration.', code: 'CLOUDFLARE_ACCOUNT_ID_MISSING' }, 503);
    }
    if (!apiToken) {
      if (cached) return json({ ...cached, cached: true, stale: true });
      return json({ error: `Cloudflare Workers AI is missing the configured Supabase Edge Function secret ${secretName}. Add a valid Cloudflare API token; Gemini is not used for Home artwork.`, code: 'CLOUDFLARE_SECRET_MISSING', requiredSecret: secretName }, 503);
    }

    const model = '@cf/black-forest-labs/flux-2-klein-4b';
    const prompt = [
      'Create a premium, cinematic, full-bleed 16:9 background artwork for a sophisticated global prediction-markets app.',
      'An elegant luminous globe with subtle latitude and longitude lines, surrounded by a few refined floating visual symbols suggesting finance, world events, sport and technology.',
      'Deep indigo and electric violet palette, restrained blue highlights, dimensional glass materials, soft atmospheric glow, high-end 3D editorial art direction.',
      'Strong focal point toward the right half and quieter dark indigo negative space toward the left for optional app controls to overlay.',
      'Edge-to-edge composition, no frame, no cards, no buttons, no interface mockup.',
      'ABSOLUTE TEXT-FREE OUTPUT: image pixels must contain no text of any kind. No letters, words, numbers, symbols, currency signs, ticker symbols, typography, labels, captions, signs, signage, logos, watermarks, UI, badges, buttons, or pseudo-readable marks. Any signs or labels in the scene must be blank. The app renders every title and message separately outside the image.',
    ].join(' ');

    const imageEndpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;
    const imageRequest: RequestInit = model.includes('flux-2-klein')
      ? (() => {
          const form = new FormData();
          form.set('prompt', prompt);
          form.set('width', '1024');
          form.set('height', '576');
          return { method: 'POST', headers: { Authorization: `Bearer ${apiToken}` }, body: form };
        })()
      : {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, steps: 4 }),
        };
    const ai = await fetch(imageEndpoint, imageRequest);

    if (!ai.ok) {
      if (cached) return json({ ...cached, cached: true, stale: true });
      return json({ error: 'Cloudflare image generation failed', providerStatus: ai.status }, 502);
    }

    const payload = await ai.json();
    const base64 = String(payload?.result?.image || payload?.image || '');
    if (!base64) {
      if (cached) return json({ ...cached, cached: true, stale: true });
      return json({ error: 'Cloudflare returned no generated image' }, 502);
    }

    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const upload = await admin.storage.from('home-promotions').upload(HERO_PATH, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: '86400',
    });

    if (upload.error) {
      if (cached) return json({ ...cached, cached: true, stale: true });
      return json({ error: 'Generated Home artwork could not be stored' }, 500);
    }

    const generatedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + DAY_MS).toISOString();
    const imageUrl = admin.storage.from('home-promotions').getPublicUrl(HERO_PATH).data.publicUrl;
    const { error: saveError } = await admin.from('home_hero_assets').upsert({
      slot: 'HOME',
      image_url: imageUrl,
      generated_at: generatedAt,
      expires_at: expiresAt,
    }, { onConflict: 'slot' });

    if (saveError) {
      if (cached) return json({ ...cached, cached: true, stale: true });
      return json({ error: 'Generated Home artwork metadata could not be saved' }, 500);
    }

    return json({ imageUrl, generatedAt, expiresAt, cached: false });
  } catch {
    return json({ error: 'Home artwork is temporarily unavailable' }, 500);
  }
});
