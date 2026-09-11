import { createClient } from 'npm:@supabase/supabase-js@2';

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  const url = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') ?? env('SUPABASE_SECRET_KEY');
  if (!url || !serviceKey) {
    return json({ ok: false, error: 'RUNTIME_CONFIG_MISSING' }, 500);
  }

  const schedulerSecret = req.headers.get('x-vad-scheduler-secret')?.trim() || '';
  if (!schedulerSecret) return json({ ok: false, error: 'SCHEDULER_AUTH_REQUIRED' }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authorized, error: authError } = await admin.rpc(
    'internal_validate_oracle_scheduler_secret',
    { p_secret: schedulerSecret },
  );

  if (authError || authorized !== true) {
    return json({ ok: false, error: 'SCHEDULER_AUTH_INVALID' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  if (!body || Array.isArray(body) || typeof body !== 'object') {
    return json({ ok: false, error: 'INVALID_BODY' }, 400);
  }

  const record = body as Record<string, unknown>;
  const action = String(record.action ?? '').toLowerCase();
  if (action !== 'health' && action !== 'process') {
    return json({ ok: false, error: 'INVALID_ACTION' }, 400);
  }

  const requestedLimit = Number(record.limit ?? 25);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(Math.trunc(requestedLimit), 100))
    : 25;

  try {
    const response = await fetch(`${url}/functions/v1/oracle-runtime`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({ action, ...(action === 'process' ? { limit } : {}) }),
    });

    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || payload.ok !== true) {
      console.error('oracle-scheduler upstream failure', {
        action,
        status: response.status,
        error: payload.error ?? 'ORACLE_RUNTIME_FAILED',
      });
      return json({ ok: false, action, error: 'ORACLE_RUNTIME_FAILED' }, 502);
    }

    console.log('oracle-scheduler completed', {
      action,
      checked: payload.checked ?? null,
      dueEvents: payload.dueEvents ?? null,
      processedEvents: payload.processedEvents ?? null,
    });

    return json({
      ok: true,
      action,
      checked: payload.checked ?? null,
      dueEvents: payload.dueEvents ?? null,
      processedEvents: payload.processedEvents ?? null,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('oracle-scheduler request failed', {
      action,
      error: error instanceof Error ? error.message : 'unknown error',
    });
    return json({ ok: false, action, error: 'ORACLE_RUNTIME_UNREACHABLE' }, 502);
  }
});
