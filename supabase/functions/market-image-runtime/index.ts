import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

type CatalogMarket = {
  instrument_public_id: string;
  title: string;
  category: string | null;
  media_path: string | null;
  status: string;
};

type ImageJob = {
  instrument_public_id: string;
  status: 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED';
  attempts: number;
  lease_expires_at: string | null;
  generated_media_path: string | null;
  updated_at: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let admin: ReturnType<typeof createClient> | null = null;
  let instrumentId = '';
  let claimed = false;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    const authorization = req.headers.get('Authorization') ?? '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!supabaseUrl || !serviceKey || !anonKey || !token) {
      return json({ error: 'Authentication required' }, 401);
    }

    admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    // A trusted server-side worker may call this function with the service-role JWT
    // after its own one-time secret check. Ordinary app requests still require a
    // valid signed-in user JWT; the service key is never shipped to a client.
    const internalWorkerCall = token === serviceKey;
    if (!internalWorkerCall) {
      const { data: authData, error: authError } = await admin.auth.getUser(token);
      if (authError || !authData.user) return json({ error: 'Authentication required' }, 401);
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return json({ error: 'Invalid request body' }, 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    instrumentId = typeof body.instrumentId === 'string' ? body.instrumentId.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(instrumentId)) {
      return json({ error: 'A valid instrumentId is required' }, 400);
    }

    // The server reads the title/category from the published catalogue; client-supplied
    // copy is deliberately ignored. Any signed-in user may request missing artwork,
    // but the server can never replace existing/manual market media.
    const { data: market, error: marketError } = await admin
      .from('market_catalog')
      .select('instrument_public_id,title,category,media_path,status')
      .eq('instrument_public_id', instrumentId)
      .maybeSingle();
    if (marketError) return json({ error: 'Market catalogue lookup failed' }, 500);
    if (!market) return json({ error: 'Market not found' }, 404);
    const catalogMarket = market as CatalogMarket;
    if (catalogMarket.media_path?.trim()) {
      return json({ ok: true, mediaPath: catalogMarket.media_path, existing: true });
    }
    if (String(catalogMarket.status).toUpperCase() === 'DRAFT') {
      return json({ error: 'Artwork is generated after the market is published' }, 409);
    }
    const title = String(catalogMarket.title ?? '').trim();
    if (!title) return json({ error: 'Market title is unavailable' }, 422);
    const category = String(catalogMarket.category ?? 'General').trim() || 'General';

    const now = new Date();
    const nowIso = now.toISOString();
    const { error: seedError } = await admin.from('market_image_generation_jobs').upsert({
      instrument_public_id: instrumentId,
      status: 'PENDING',
      attempts: 0,
      updated_at: nowIso,
    }, { onConflict: 'instrument_public_id', ignoreDuplicates: true });
    if (seedError) return json({ error: 'Image generation queue is unavailable' }, 500);

    const { data: beforeClaim, error: jobError } = await admin
      .from('market_image_generation_jobs')
      .select('instrument_public_id,status,attempts,lease_expires_at,generated_media_path,updated_at')
      .eq('instrument_public_id', instrumentId)
      .maybeSingle();
    if (jobError || !beforeClaim) return json({ error: 'Image generation queue is unavailable' }, 500);
    let job = beforeClaim as ImageJob;

    // Authenticated clients may wake queued jobs, but a failing provider must not
    // be retried on every page refresh. Permit a later recovery attempt after 24h.
    const retryWindowMs = 24 * 60 * 60 * 1000;
    const retryLimitReached = Number(job.attempts ?? 0) >= 5
      && Number.isFinite(Date.parse(job.updated_at))
      && now.getTime() - Date.parse(job.updated_at) < retryWindowMs;
    const leaseExpired = Boolean(job.lease_expires_at)
      && Date.parse(job.lease_expires_at as string) <= now.getTime();
    if (retryLimitReached && (job.status === 'FAILED' || (job.status === 'GENERATING' && leaseExpired))) {
      return json({ error: 'Market artwork generation is paused after repeated failures. Try again later.' }, 429);
    }

    if (job.status === 'DONE') {
      const { data: refreshed } = await admin.from('market_catalog')
        .select('media_path').eq('instrument_public_id', instrumentId).maybeSingle();
      if (refreshed?.media_path) return json({ ok: true, mediaPath: refreshed.media_path, existing: true });
    }

    if (job.status === 'FAILED') {
      await admin.from('market_image_generation_jobs')
        .update({ status: 'PENDING', last_error: null, lease_expires_at: null, updated_at: nowIso })
        .eq('instrument_public_id', instrumentId)
        .eq('status', 'FAILED');
    } else if (job.status === 'GENERATING' && job.lease_expires_at && Date.parse(job.lease_expires_at) <= now.getTime()) {
      await admin.from('market_image_generation_jobs')
        .update({ status: 'PENDING', last_error: null, lease_expires_at: null, updated_at: nowIso })
        .eq('instrument_public_id', instrumentId)
        .eq('status', 'GENERATING')
        .lte('lease_expires_at', nowIso);
    } else if (job.status === 'GENERATING') {
      return json({ ok: true, pending: true }, 202);
    }

    const { data: refreshedJob, error: refreshedJobError } = await admin
      .from('market_image_generation_jobs')
      .select('instrument_public_id,status,attempts,lease_expires_at,generated_media_path,updated_at')
      .eq('instrument_public_id', instrumentId)
      .maybeSingle();
    if (refreshedJobError || !refreshedJob) return json({ error: 'Image generation queue is unavailable' }, 500);
    job = refreshedJob as ImageJob;
    if (job.status === 'DONE') {
      const { data: refreshed } = await admin.from('market_catalog')
        .select('media_path').eq('instrument_public_id', instrumentId).maybeSingle();
      if (refreshed?.media_path) return json({ ok: true, mediaPath: refreshed.media_path, existing: true });
      await admin.from('market_image_generation_jobs').update({ status: 'PENDING' })
        .eq('instrument_public_id', instrumentId).eq('status', 'DONE');
    }

    const leaseExpiry = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    const { data: claimRow, error: claimError } = await admin
      .from('market_image_generation_jobs')
      .update({
        status: 'GENERATING',
        attempts: Number(job.attempts ?? 0) + 1,
        started_at: nowIso,
        lease_expires_at: leaseExpiry,
        last_error: null,
        updated_at: nowIso,
      })
      .eq('instrument_public_id', instrumentId)
      .eq('status', 'PENDING')
      .select('instrument_public_id')
      .maybeSingle();
    if (claimError) return json({ error: 'Could not claim image generation job' }, 500);
    if (!claimRow) {
      return json({ ok: true, pending: true }, 202);
    }
    claimed = true;

    const failJob = async (message: string, status = 502) => {
      await admin!.from('market_image_generation_jobs')
        .update({
          status: 'FAILED',
          last_error: message.slice(0, 700),
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('instrument_public_id', instrumentId)
        .eq('status', 'GENERATING');
      claimed = false;
      return json({ error: message }, status);
    };

    // The integration schema is intentionally not exposed through PostgREST.
    // Read only the configured image provider's public metadata via a privileged RPC.
    const { data: provider, error: providerError } = await admin
      .rpc('get_cloudflare_market_image_provider_runtime');
    const accountId = String(provider?.public_metadata?.account_id || '').trim();
    const secretName = String(provider?.secret_reference || 'VAD_AI_CLOUDFLARE_API_TOKEN').trim();
    const apiToken = Deno.env.get(secretName);
    if (providerError) {
      return await failJob('Cloudflare provider configuration could not be loaded. Check the configured image provider and runtime metadata.', 503);
    }
    if (!accountId) {
      return await failJob('Cloudflare account ID is missing from the image-provider configuration.', 503);
    }
    if (!apiToken) {
      return await failJob(`Cloudflare image generation is blocked because Supabase Edge Function secret ${secretName} is missing. Add the Cloudflare API token in Supabase project Edge Function secrets; Gemini is not used for this artwork.`, 503);
    }

    const model = Deno.env.get('CLOUDFLARE_IMAGE_MODEL') || '@cf/black-forest-labs/flux-2-klein-4b';
    const prompt = [
      'Generate a premium, text-free 16:9 editorial cover image for a prediction-market question. Use one clear, accurate visual subject, polished photographic/editorial style, high detail, restrained colors, and clean composition.',
      `Market question is semantic guidance only; do not write or reproduce any part of it: ${title}. Category: ${category}.`,
      'Depict only the specific subject/asset named by the question. Never substitute a different company, person, team, cryptocurrency, ticker, brand, coin, or logo. For financial/crypto price questions, prefer an abstract asset-themed scene without coin logos or currency symbols. If the named subject cannot be depicted accurately without branding, use neutral abstract imagery instead.',
      'ABSOLUTE NO-TEXT REQUIREMENT: no text, letters, words, numbers, ticker symbols, logos, typography, labels, signs, packaging text, prices, odds, captions, fake headlines, YES/NO controls, UI, watermark, or pseudo-writing. Do not render the question; the app displays the market title separately.',
    ].join(' ');
    // Flux 2 Klein supports explicit output dimensions. Flux 1 Schnell
    // ignores width/height, so only send those options to a dimension-capable model.
    const modelInput = model.toLowerCase().includes('flux-2-klein')
      ? { prompt, width: 1280, height: 720 }
      : { prompt, steps: 4 };

    const ai = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(modelInput),
    });
    if (!ai.ok) {
      const detail = (await ai.text()).slice(0, 500);
      return await failJob(`Cloudflare image generation failed (HTTP ${ai.status}): ${detail}`, 502);
    }

    const payload = await ai.json();
    const encodedImage = String(payload?.result?.image || payload?.image || '');
    const base64 = encodedImage.replace(/^data:image\/[^;]+;base64,/i, '').replace(/\s/g, '');
    if (!base64) return await failJob('Cloudflare returned no generated image', 502);

    let binary: string;
    try {
      binary = atob(base64);
    } catch {
      return await failJob('Cloudflare returned an invalid base64 image payload', 502);
    }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    // Respect the actual provider payload format. Mislabeling PNG bytes as JPEG
    // can make browsers and native image decoders reject the generated artwork.
    const isPng = bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isWebp = bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (!isPng && !isJpeg && !isWebp) {
      return await failJob('Cloudflare returned an unsupported image format', 502);
    }
    const extension = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
    const contentType = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
    const path = `generated/${instrumentId}/cover-${Date.now()}.${extension}`;
    const upload = await admin.storage.from('market-media').upload(path, bytes, {
      contentType,
      cacheControl: '31536000',
      upsert: false,
    });
    if (upload.error) return await failJob('Generated image could not be stored', 500);

    const { data: attached, error: attachError } = await admin.rpc('internal_set_market_generated_media', {
      p_instrument_public_id: instrumentId,
      p_media_path: path,
      p_provider: 'CLOUDFLARE_WORKERS_AI',
      p_model: model,
      p_prompt: prompt,
    });
    if (attachError) {
      await admin.storage.from('market-media').remove([path]);
      return await failJob('Generated image could not be attached to the market', 500);
    }

    if (attached !== true) {
      // A manual upload or another completed generation won the race. Keep that image.
      await admin.storage.from('market-media').remove([path]);
      const { data: latest } = await admin.from('market_catalog')
        .select('media_path').eq('instrument_public_id', instrumentId).maybeSingle();
      if (latest?.media_path) {
        await admin.from('market_image_generation_jobs').update({
          status: 'DONE',
          generated_media_path: latest.media_path,
          lease_expires_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq('instrument_public_id', instrumentId);
        claimed = false;
        return json({ ok: true, mediaPath: latest.media_path, existing: true });
      }
      return await failJob('Generated image was not attached; it will be retried', 500);
    }

    claimed = false;
    return json({ ok: true, mediaPath: path, model });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected image generation error';
    if (admin && instrumentId && claimed) {
      await admin.from('market_image_generation_jobs')
        .update({ status: 'FAILED', last_error: message.slice(0, 700), lease_expires_at: null, updated_at: new Date().toISOString() })
        .eq('instrument_public_id', instrumentId)
        .eq('status', 'GENERATING');
    }
    return json({ error: message }, 500);
  }
});
