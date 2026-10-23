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

    // Reuse VAD's existing Cloudflare Workers AI provider configuration.
    const { data: provider } = await admin
      .schema('integration')
      .from('providers')
      .select('secret_reference, public_metadata')
      .eq('code', 'CLOUDFLARE_WORKERS_AI')
      .eq('environment', 'PRODUCTION')
      .in('status', ['ACTIVE', 'DEGRADED'])
      .maybeSingle();

    const accountId = String(provider?.public_metadata?.account_id || '').trim();
    const secretName = String(provider?.secret_reference || 'VAD_AI_CLOUDFLARE_API_TOKEN').trim();
    const apiToken = Deno.env.get(secretName);

    if (!accountId || !apiToken) {
      if (cached) return json({ ...cached, cached: true, stale: true });
      return json({ error: 'Cloudflare image generation is not configured', code: 'CLOUDFLARE_NOT_CONFIGURED' }, 503);
    }

    const model = Deno.env.get('CLOUDFLARE_IMAGE_MODEL') || '@cf/black-forest-labs/flux-2-klein-4b';
    const prompt = [
      'Create a premium, cinematic, full-bleed 16:9 background artwork for a sophisticated global prediction-markets app.',
      'An elegant luminous globe with subtle latitude and longitude lines, surrounded by a few refined floating visual symbols suggesting finance, world events, sport and technology.',
      'Deep indigo and electric violet palette, restrained blue highlights, dimensional glass materials, soft atmospheric glow, high-end 3D editorial art direction.',
      'Strong focal point toward the right half and quieter dark indigo negative space toward the left for optional app controls to overlay.',
      'Edge-to-edge composition, no frame, no cards, no buttons, no interface mockup.',
      'ABSOLUTE TEXT-FREE OUTPUT: image pixels must contain no text of any kind. No letters, words, numbers, symbols, currency signs, ticker symbols, typography, labels, captions, signs, signage, logos, watermarks, UI, badges, buttons, or pseudo-readable marks. Any signs or labels in the scene must be blank. The app renders every title and message separately outside the image.',
    ].join(' ');

    const ai = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(model.toLowerCase().includes('flux-2-klein') ? { prompt, width: 1280, height: 720 } : { prompt, steps: 4 }),
      },
    );

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
