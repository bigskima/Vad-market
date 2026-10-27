import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type MarketAgentScope = 'market:read' | 'market:create' | 'market:publish';
export type MarketAgentKey = {
  id: string;
  name: string;
  scopes: MarketAgentScope[];
  status: 'ACTIVE' | 'REVOKED';
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
};
export type IssuedMarketAgentKey = {
  id: string;
  name: string;
  apiKey: string;
  scopes: MarketAgentScope[];
  expiresAt: string | null;
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback: string): void {
  if (error) throw userFacingError(error, 'admin', fallback);
}

export async function listMarketAgentKeys(): Promise<MarketAgentKey[]> {
  const { data, error } = await supabase.rpc('admin_list_market_agent_keys');
  fail(error, 'The market-agent keys could not be loaded.');
  return (Array.isArray(data) ? data : []) as MarketAgentKey[];
}

export async function issueMarketAgentKey(input: {
  name: string;
  scopes: MarketAgentScope[];
  expiresAt?: string | null;
}): Promise<IssuedMarketAgentKey> {
  const { data, error } = await supabase.rpc('admin_issue_market_agent_key', {
    p_name: input.name.trim(),
    p_scopes: input.scopes,
    p_expires_at: input.expiresAt || null,
  });
  fail(error, 'A market-agent key could not be issued.');
  const raw = data as Partial<IssuedMarketAgentKey> | null;
  if (!raw?.id || !raw.apiKey || !Array.isArray(raw.scopes)) {
    throw new Error('VAD did not return a complete one-time API key.');
  }
  return raw as IssuedMarketAgentKey;
}

export async function revokeMarketAgentKey(id: string): Promise<void> {
  const { data, error } = await supabase.rpc('admin_revoke_market_agent_key', { p_id: id });
  fail(error, 'The market-agent key could not be revoked.');
  if (data !== true) throw new Error('This agent key is already revoked or is not available to your account.');
}
