import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!supabaseUrl || !serviceKey || !token) return json({ error: 'Worker authorization required' }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The cron secret is held in Supabase Vault and verified inside a service-role-only
  // RPC. Neither the secret nor an administrative key is exposed to the client app.
  const { data: authorized, error: authError } = await admin.rpc(
    'is_market_image_worker_authorized',
    { p_token: token },
  );
  if (authError || authorized !== true) return json({ error: 'Worker authorization failed' }, 401);

  let requestedLimit = 2;
  try {
    const body = await req.json();
    if (body && typeof body.limit === 'number') requestedLimit = Math.floor(body.limit);
  } catch {
    // The empty body uses the safe default batch size.
  }
  const limit = Math.max(1, Math.min(4, requestedLimit));

  const { data: jobs, error: jobError } = await admin
    .from('market_image_generation_jobs')
    .select('instrument_public_id,attempts,updated_at')
    .eq('status', 'PENDING')
    .lt('attempts', 5)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (jobError) {
    return json({ error: 'Queued market artwork could not be loaded' }, 500);
  }

  const results: Array<{ instrumentId: string; status: string; error?: string }> = [];
  for (const job of jobs ?? []) {
    try {
      const requestHeaders = {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      };
      // Resolve source-provided cover art before spending provider credits on AI.
      // A DONE job without generated_media_path means the market has relevant
      // publisher art; the app reads that URL from market-source-image. If that
      // source is unavailable later, market-image-runtime can re-open this job
      // and produce AI artwork as the fallback.
      const sourceResponse = await fetch(`${supabaseUrl}/functions/v1/market-source-image`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ instrumentId: job.instrument_public_id }),
      });
      const sourcePayload = await sourceResponse.json().catch(() => ({})) as {
        ok?: boolean;
        source?: string;
        imageUrl?: string;
        hasExistingMedia?: boolean;
        mediaPath?: string;
        replacedGeneratedMedia?: boolean;
        existingGeneratedMediaPath?: string;
        error?: string;
      };
      if (sourceResponse.ok && sourcePayload.ok === true
        && sourcePayload.source === 'publisher'
        && typeof sourcePayload.imageUrl === 'string'
        && /^https:\/\//i.test(sourcePayload.imageUrl)) {
        const { error: markSourceDoneError } = await admin
          .from('market_image_generation_jobs')
          .update({
            status: 'DONE',
            generated_media_path: sourcePayload.replacedGeneratedMedia === true
              && typeof sourcePayload.existingGeneratedMediaPath === 'string'
              ? sourcePayload.existingGeneratedMediaPath
              : null,
            provider_code: 'GDELT_PUBLISHER_IMAGE',
            model_code: 'SOURCE_ARTICLE_IMAGE',
            prompt_text: 'Source-first image lookup found relevant publisher-provided cover art. AI remains the fallback when this source is unavailable.',
            last_error: null,
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('instrument_public_id', job.instrument_public_id)
          .eq('status', 'PENDING');
        if (markSourceDoneError) throw new Error('Could not mark the publisher-image job as complete.');
        results.push({ instrumentId: job.instrument_public_id, status: 'SOURCE_IMAGE' });
        continue;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/market-image-runtime`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ instrumentId: job.instrument_public_id }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; mediaPath?: string; pending?: boolean; error?: string };
      if (!response.ok) {
        results.push({
          instrumentId: job.instrument_public_id,
          status: 'FAILED',
          error: payload.error || `Image service returned HTTP ${response.status}`,
        });
      } else {
        results.push({
          instrumentId: job.instrument_public_id,
          status: payload.mediaPath ? 'DONE' : payload.pending ? 'PENDING' : payload.ok ? 'ACCEPTED' : 'FAILED',
          ...(!payload.ok && payload.error ? { error: payload.error } : {}),
        });
      }
    } catch (error) {
      results.push({
        instrumentId: job.instrument_public_id,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Image generation request failed',
      });
    }
  }

  return json({
    ok: true,
    selected: jobs?.length ?? 0,
    completed: results.filter((row) => row.status === 'DONE' || row.status === 'SOURCE_IMAGE').length,
    sourceImages: results.filter((row) => row.status === 'SOURCE_IMAGE').length,
    aiGenerated: results.filter((row) => row.status === 'DONE').length,
    failed: results.filter((row) => row.status === 'FAILED').length,
    remainingQueuedEstimate: Math.max(0, (jobs?.length ?? 0) - results.length),
    results,
    ranAt: new Date().toISOString(),
  });
});
