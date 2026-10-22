import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type AdminEventDiscoverySource = {
  code: string;
  name: string;
  adapter_code: 'GDELT_DOC_V2' | 'RSS_ATOM' | string;
  endpoint: string;
  category_codes: string[];
  region_codes: string[];
  status: 'ACTIVE' | 'DISABLED' | 'DEGRADED' | string;
  priority: number;
  daily_request_limit: number;
  cache_seconds: number;
  config: Record<string, unknown>;
  updated_at: string;
};

export type DiscoveredEventCandidate = {
  candidate_public_id: string;
  source_code: string;
  source_name: string;
  category_code: string;
  category_name: string;
  region_code: string;
  title: string;
  summary: string | null;
  source_url: string;
  source_published_at: string | null;
  status: 'DISCOVERED' | 'REVIEWED' | 'IGNORED' | 'DRAFTED' | 'DUPLICATE' | string;
  first_seen_at: string;
  last_seen_at: string;
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback: string) {
  if (error) throw userFacingError(error, 'admin', fallback);
}

export async function getAdminEventDiscoverySources(): Promise<AdminEventDiscoverySource[]> {
  const { data, error } = await supabase.rpc('admin_event_discovery_sources');
  fail(error, 'Event-discovery source settings could not be loaded.');
  return (Array.isArray(data) ? data : []) as AdminEventDiscoverySource[];
}

export async function upsertAdminEventDiscoverySource(input: {
  code: string;
  name: string;
  adapterCode: 'GDELT_DOC_V2' | 'RSS_ATOM';
  endpoint: string;
  categoryCodes?: string[];
  regionCodes?: string[];
  status?: 'ACTIVE' | 'DISABLED';
}) {
  const { data, error } = await supabase.rpc('admin_upsert_event_discovery_source', {
    p_code: input.code.trim().toUpperCase(),
    p_name: input.name.trim(),
    p_adapter_code: input.adapterCode,
    p_endpoint: input.endpoint.trim(),
    p_category_codes: input.categoryCodes?.length ? input.categoryCodes : ['*'],
    p_region_codes: input.regionCodes?.length ? input.regionCodes : ['*'],
    p_status: input.status ?? 'DISABLED',
    p_priority: 100,
    p_daily_request_limit: 100,
    p_cache_seconds: 300,
    p_config: {},
    p_reason: 'Added or updated an event-discovery source from Admin',
  });
  fail(error, 'The event-discovery source could not be saved.');
  return String(data ?? '');
}

export async function setAdminEventDiscoverySourceStatus(input: {
  code: string;
  status: 'ACTIVE' | 'DISABLED' | 'DEGRADED';
}) {
  const { data, error } = await supabase.rpc('admin_set_event_discovery_source_status', {
    p_code: input.code,
    p_status: input.status,
    p_reason: 'Changed event-discovery source status from Admin',
  });
  fail(error, 'The event-discovery source status could not be changed.');
  return Boolean(data);
}

export async function listAdminDiscoveredEventCandidates(input: {
  categoryCode?: string | null;
  limit?: number;
} = {}): Promise<DiscoveredEventCandidate[]> {
  const { data, error } = await supabase.rpc('admin_list_discovered_event_candidates', {
    p_category_code: input.categoryCode?.trim().toUpperCase() || null,
    p_limit: Math.max(1, Math.min(100, Math.floor(input.limit ?? 50))),
  });
  fail(error, 'Discovered event candidates could not be loaded.');
  return (Array.isArray(data) ? data : []) as DiscoveredEventCandidate[];
}

export async function setDiscoveredEventCandidateStatus(input: {
  candidatePublicId: string;
  status: 'REVIEWED' | 'IGNORED';
}) {
  const { data, error } = await supabase.rpc('admin_set_discovered_event_candidate_status', {
    p_candidate_public_id: input.candidatePublicId,
    p_status: input.status,
    p_reason: input.status === 'REVIEWED'
      ? 'Administrator reviewed the discovery candidate'
      : 'Administrator dismissed the discovery candidate',
  });
  fail(error, 'The event-discovery review status could not be saved.');
  return Boolean(data);
}

export async function runAdminEventDiscovery(input: {
  categoryCode: string;
  query?: string;
  regionCode?: string;
}) {
  const { data, error } = await supabase.functions.invoke('market-event-discovery', {
    body: {
      categoryCode: input.categoryCode.trim().toUpperCase(),
      query: input.query?.trim() || null,
      regionCode: input.regionCode?.trim().toUpperCase() || 'GLOBAL',
    },
  });
  if (error) throw userFacingError(error, 'admin', 'Event discovery could not reach its configured sources.');
  const payload = data as {
    ok?: boolean;
    message?: string;
    query?: string;
    categoryCode?: string;
    categoryName?: string;
    sources?: { code: string; name: string; status: string; count: number; cached?: boolean; stale?: boolean; message?: string }[];
    candidates?: DiscoveredEventCandidate[];
    error?: string;
  };
  if (payload?.error) throw new Error(payload.message || payload.error);
  if (!payload || !Array.isArray(payload.sources)) {
    throw new Error('The event-discovery response was not valid.');
  }
  if (payload.ok === false) {
    const failures = payload.sources.map((source) => source.message).filter(Boolean).join(' ');
    throw new Error(failures || payload.message || 'No configured source returned usable results.');
  }
  return payload;
}
