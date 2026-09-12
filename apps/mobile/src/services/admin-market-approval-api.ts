import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type AdminMarketAutoOptions = {
  jurisdictions: { countryCode: string; name: string; assets: string[] }[];
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback: string) {
  if (error) throw userFacingError(error, 'admin', fallback);
}

export async function getAdminMarketAutoOptions() {
  const { data, error } = await supabase.rpc('admin_market_approval_options');
  fail(error, 'We could not load the available market currencies right now.');
  const raw = (data ?? {}) as Partial<AdminMarketAutoOptions>;
  return {
    jurisdictions: Array.isArray(raw.jurisdictions) ? raw.jurisdictions : [],
  } satisfies AdminMarketAutoOptions;
}

export async function approveAdminMarketProposalAutomatically(input: {
  proposalPublicId: string;
  title: string;
  description: string;
  category: string;
  opensAt: string;
  closesAt: string;
  resolvesAfter: string;
  countryCode: string;
  assetCode: string;
}) {
  const { data, error } = await supabase.rpc('admin_approve_market_proposal_auto', {
    p_proposal_public_id: input.proposalPublicId,
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_category: input.category.trim(),
    p_opens_at: input.opensAt,
    p_closes_at: input.closesAt,
    p_resolves_after: input.resolvesAfter,
    p_country_code: input.countryCode,
    p_asset_code: input.assetCode,
  });
  fail(error, 'We could not approve this market right now. Please try again.');
  return (data ?? {}) as Record<string, unknown>;
}

export async function createAdminMarketDraft(input: {
  title: string;
  description: string;
  category: string;
  opensAt: string;
  closesAt: string;
  resolvesAfter: string;
  countryCode: string;
  assetCode: string;
}) {
  const { data, error } = await supabase.rpc('admin_create_market_draft', {
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_category: input.category.trim(),
    p_opens_at: input.opensAt,
    p_closes_at: input.closesAt,
    p_resolves_after: input.resolvesAfter,
    p_country_code: input.countryCode,
    p_asset_code: input.assetCode,
  });
  fail(error, 'We could not create this VAD market right now.');
  return (data ?? {}) as Record<string, unknown>;
}

export async function decideAdminMarketProposalSimple(input: {
  proposalPublicId: string;
  decision: 'REJECT' | 'NEEDS_CLARIFICATION';
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_decide_market_proposal', {
    p_proposal_public_id: input.proposalPublicId,
    p_decision: input.decision,
    p_reason: input.reason.trim(),
  });
  fail(error, 'We could not save this proposal decision right now.');
  return Boolean(data);
}
