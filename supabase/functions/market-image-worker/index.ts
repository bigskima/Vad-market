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
      const response = await fetch(`${supabaseUrl}/functions/v1/market-image-runtime`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
        },
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
    completed: results.filter((row) => row.status === 'DONE').length,
    failed: results.filter((row) => row.status === 'FAILED').length,
    remainingQueuedEstimate: Math.max(0, (jobs?.length ?? 0) - results.length),
    results,
    ranAt: new Date().toISOString(),
  });
});
