import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { OracleRuntimeError } from './types.ts';

export function env(name: string) {
  return Deno.env.get(name)?.trim() || null;
}

function credentials() {
  const url = env('SUPABASE_URL');
  const anon = env('SUPABASE_ANON_KEY') ?? env('SUPABASE_PUBLISHABLE_KEY');
  const service = env('SUPABASE_SERVICE_ROLE_KEY') ?? env('SUPABASE_SECRET_KEY');
  if (!url || !anon || !service) {
    throw new OracleRuntimeError('RUNTIME_CONFIG_MISSING', 'Supabase runtime credentials unavailable', 500);
  }
  return { url, anon, service };
}

export function serviceClient() {
  const { url, service } = credentials();
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function userClient(authHeader: string) {
  const { url, anon } = credentials();
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type RuntimeActor = {
  admin: SupabaseClient;
  userId: string | null;
  serviceRole: boolean;
};

export async function requireRuntimeAccess(req: Request, action: 'health' | 'process'): Promise<RuntimeActor> {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new OracleRuntimeError('AUTH_REQUIRED', 'Authorization required', 401);

  const { service } = credentials();
  const admin = serviceClient();

  // A scheduled/internal caller may use the classic service-role JWT. The Edge
  // gateway still verifies JWTs; comparing the exact runtime secret avoids trusting
  // an unverified decoded role claim inside application code.
  if (token === service) {
    return { admin, userId: null, serviceRole: true };
  }

  const user = userClient(authHeader);
  const { data: authData, error: authError } = await user.auth.getUser(token);
  if (authError || !authData.user) {
    throw new OracleRuntimeError('AUTH_INVALID', 'Invalid user session', 401);
  }

  const { data: access, error: accessError } = await user.rpc('admin_oracle_runtime_access');
  if (accessError || !access || typeof access !== 'object') {
    throw new OracleRuntimeError('ACCESS_CHECK_FAILED', 'Oracle runtime permission check failed', 403);
  }

  const permissions = access as Record<string, unknown>;
  const allowed = action === 'process' ? permissions.canProcess === true : permissions.canRead === true;
  if (!allowed) {
    throw new OracleRuntimeError('PERMISSION_REQUIRED', 'Oracle runtime permission required', 403);
  }

  return { admin, userId: authData.user.id, serviceRole: false };
}
