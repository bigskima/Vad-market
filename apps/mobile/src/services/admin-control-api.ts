import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type AdminRole = {
  code: string;
  name: string;
};

export type AdminAccess = {
  roles: AdminRole[];
  permissions: string[];
  isSuperAdmin: boolean;
};

export type AdminUserRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  handle: string | null;
  status: 'ACTIVE' | 'RESTRICTED' | 'SUSPENDED' | 'BANNED' | 'DEACTIVATED' | 'UNDER_REVIEW';
  country_code: string;
  created_at: string;
  latest_action_reason: string | null;
  latest_action_at: string | null;
};

export type AdminContentRow = {
  content_type: 'POST' | 'COMMENT';
  content_public_id: string;
  post_public_id: string;
  author_user_id: string;
  author_name: string;
  author_handle: string | null;
  body: string;
  status: 'PUBLISHED' | 'REMOVED';
  created_at: string;
};

export type AdminRoleCatalogRow = {
  role_code: string;
  role_name: string;
  description: string;
  is_system: boolean;
  assigned_count: number;
};

export type AdminRolePermissionRow = {
  role_code: string;
  role_name: string;
  permission_code: string | null;
  permission_description: string | null;
};

export type AdminRoleAssignmentRow = {
  assignment_id: number;
  user_id: string;
  email: string | null;
  display_name: string | null;
  role_code: string;
  role_name: string;
  reason: string;
  effective_at: string;
  expires_at: string | null;
};

export type AdminMarketApprovalOptions = {
  templates: { code: string; name: string }[];
  oraclePolicies: { publicId: string; name: string; version: number }[];
  jurisdictions: { countryCode: string; name: string; assets: string[] }[];
};

export type AdminMarketPublicationRow = {
  instrument_public_id: string;
  event_public_id: string;
  title: string;
  category: string;
  asset_code: string;
  instrument_status: string;
  event_status: string;
  opens_at: string | null;
  closes_at: string;
  is_featured: boolean;
  feature_rank: number | null;
  featured_at: string | null;
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback = 'This admin request could not be completed. Please try again.') {
  if (error) throw userFacingError(error, 'admin', fallback);
}

export function hasAdminPermission(access: AdminAccess, permission: string) {
  return access.isSuperAdmin || access.permissions.includes(permission);
}

export function hasAnyAdminPermission(access: AdminAccess, permissions: string[]) {
  return access.isSuperAdmin || permissions.some((permission) => access.permissions.includes(permission));
}

export async function getAdminAccess() {
  const { data, error } = await supabase.rpc('admin_my_access');
  fail(error, 'We could not confirm your admin access. Refresh and try again.');

  const raw = (data ?? {}) as Partial<AdminAccess>;
  return {
    roles: Array.isArray(raw.roles) ? raw.roles : [],
    permissions: Array.isArray(raw.permissions) ? raw.permissions : [],
    isSuperAdmin: Boolean(raw.isSuperAdmin),
  } satisfies AdminAccess;
}

export async function getAdminUsers(limit = 100, search?: string) {
  const { data, error } = await supabase.rpc('admin_user_queue', {
    p_limit: limit,
    p_search: search?.trim() || null,
  });
  fail(error, 'We could not load users right now. Refresh and try again.');
  return (data ?? []) as AdminUserRow[];
}

export async function setAdminUserStatus(input: {
  userId: string;
  status: AdminUserRow['status'];
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_set_user_status', {
    p_user_id: input.userId,
    p_status: input.status,
    p_reason: input.reason.trim(),
  });
  fail(error, 'We could not update this user right now. Please try again.');
  return Boolean(data);
}

export async function getAdminContent(
  limit = 100,
  status?: AdminContentRow['status'],
) {
  const { data, error } = await supabase.rpc('admin_content_queue', {
    p_limit: limit,
    p_status: status ?? null,
  });
  fail(error, 'We could not load moderation content right now. Refresh and try again.');
  return (data ?? []) as AdminContentRow[];
}

export async function setAdminContentStatus(input: {
  contentType: AdminContentRow['content_type'];
  contentPublicId: string;
  status: AdminContentRow['status'];
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_set_content_status', {
    p_content_type: input.contentType,
    p_content_public_id: input.contentPublicId,
    p_status: input.status,
    p_reason: input.reason.trim(),
  });
  fail(error, 'We could not update this content right now. Please try again.');
  return Boolean(data);
}

export async function requestAdminRefund(intentPublicId: string, reason: string) {
  const { data, error } = await supabase.rpc('admin_request_refund', {
    p_intent_public_id: intentPublicId,
    p_reason: reason.trim(),
  });
  fail(error, 'We could not submit this refund request right now. Please try again.');
  return String(data);
}

export async function closeAdminMarket(instrumentPublicId: string, reason: string) {
  const { data, error } = await supabase.rpc('admin_close_market', {
    p_instrument_public_id: instrumentPublicId,
    p_reason: reason.trim() || null,
  });
  fail(error, 'We could not close this market right now. Please try again.');
  return Boolean(data);
}

export async function createAdminProvisionalResolution(input: {
  eventPublicId: string;
  outcomeCode: string;
  evidence?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc('admin_create_provisional_resolution', {
    p_event_public_id: input.eventPublicId,
    p_outcome_code: input.outcomeCode.toUpperCase(),
    p_evidence: input.evidence ?? {},
  });
  fail(error, 'We could not save this provisional resolution right now. Please try again.');
  return Number(data);
}

export async function finalizeAdminResolution(
  resolutionId: number,
  evidence?: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc('admin_finalize_resolution', {
    p_resolution_id: resolutionId,
    p_evidence: evidence ?? {},
  });
  fail(error, 'We could not finalize this resolution right now. Please try again.');
  return Boolean(data);
}

export async function finalizeAdminVoid(
  resolutionId: number,
  evidence?: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc('admin_finalize_void', {
    p_resolution_id: resolutionId,
    p_evidence: evidence ?? {},
  });
  fail(error, 'We could not finalize this void right now. Please try again.');
  return Boolean(data);
}

export async function settleAdminMarket(instrumentPublicId: string) {
  const { data, error } = await supabase.rpc('admin_settle_market', {
    p_instrument_public_id: instrumentPublicId,
  });
  fail(error, 'We could not settle this market right now. Please try again.');
  return String(data);
}

export async function getAdminRoleCatalog() {
  const { data, error } = await supabase.rpc('admin_role_catalog');
  fail(error, 'We could not load admin roles right now. Refresh and try again.');
  return (data ?? []) as AdminRoleCatalogRow[];
}

export async function getAdminRolePermissionMatrix() {
  const { data, error } = await supabase.rpc('admin_role_permission_matrix');
  fail(error, 'We could not load role permissions right now. Refresh and try again.');
  return (data ?? []) as AdminRolePermissionRow[];
}

export async function getAdminRoleAssignments(search?: string) {
  const { data, error } = await supabase.rpc('admin_role_assignments', {
    p_search: search?.trim() || null,
  });
  fail(error, 'We could not load role assignments right now. Refresh and try again.');
  return (data ?? []) as AdminRoleAssignmentRow[];
}

export async function assignAdminRole(input: {
  userId: string;
  roleCode: string;
  reason: string;
  expiresAt?: string | null;
}) {
  const { data, error } = await supabase.rpc('admin_assign_role', {
    p_user_id: input.userId,
    p_role_code: input.roleCode,
    p_reason: input.reason.trim(),
    p_expires_at: input.expiresAt ?? null,
  });
  fail(error, 'We could not assign this role right now. Please try again.');
  return Number(data);
}

export async function revokeAdminRole(assignmentId: number, reason: string) {
  const { data, error } = await supabase.rpc('admin_revoke_role', {
    p_assignment_id: assignmentId,
    p_reason: reason.trim(),
  });
  fail(error, 'We could not revoke this role right now. Please try again.');
  return Boolean(data);
}

export async function getAdminMarketApprovalOptions() {
  const { data, error } = await supabase.rpc('admin_market_approval_options');
  fail(error, 'We could not load market approval options right now. Refresh and try again.');
  const raw = (data ?? {}) as Partial<AdminMarketApprovalOptions>;
  return {
    templates: Array.isArray(raw.templates) ? raw.templates : [],
    oraclePolicies: Array.isArray(raw.oraclePolicies) ? raw.oraclePolicies : [],
    jurisdictions: Array.isArray(raw.jurisdictions) ? raw.jurisdictions : [],
  } satisfies AdminMarketApprovalOptions;
}

export async function decideAdminMarketProposal(input: {
  proposalPublicId: string;
  decision: 'REJECT' | 'NEEDS_CLARIFICATION';
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_decide_market_proposal', {
    p_proposal_public_id: input.proposalPublicId,
    p_decision: input.decision,
    p_reason: input.reason.trim(),
  });
  fail(error, 'We could not save this proposal decision right now. Please try again.');
  return Boolean(data);
}

export async function approveAdminMarketProposal(input: {
  proposalPublicId: string;
  templateCode: string;
  title: string;
  description: string;
  category: string;
  normalizedParameters: Record<string, unknown>;
  resolutionScope: Record<string, unknown>;
  opensAt: string;
  closesAt: string;
  resolvesAfter: string;
  oraclePolicyPublicId: string;
  countryCode: string;
  assetCode: string;
  minOrderNotional: number;
  pricingPrecision: number;
}) {
  const { data, error } = await supabase.rpc('admin_approve_market_proposal', {
    p_proposal_public_id: input.proposalPublicId,
    p_template_code: input.templateCode,
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_category: input.category.trim(),
    p_normalized_parameters: input.normalizedParameters,
    p_resolution_scope: input.resolutionScope,
    p_opens_at: input.opensAt,
    p_closes_at: input.closesAt,
    p_resolves_after: input.resolvesAfter,
    p_oracle_policy_public_id: input.oraclePolicyPublicId,
    p_country_code: input.countryCode,
    p_asset_code: input.assetCode,
    p_min_order_notional: input.minOrderNotional,
    p_pricing_precision: input.pricingPrecision,
  });
  fail(error, 'We could not approve this market proposal right now. Please try again.');
  return (data ?? {}) as Record<string, unknown>;
}

export async function getAdminMarketPublicationQueue() {
  const { data, error } = await supabase.rpc('admin_market_publication_queue');
  fail(error, 'We could not load the publication queue right now. Refresh and try again.');
  return (data ?? []) as AdminMarketPublicationRow[];
}

export async function publishAdminMarket(input: {
  instrumentPublicId: string;
  featureRank?: number;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_publish_market', {
    p_instrument_public_id: input.instrumentPublicId,
    p_feature_rank: input.featureRank ?? 100,
    p_reason: input.reason.trim(),
  });
  fail(error, 'We could not publish this market right now. Please try again.');
  return Boolean(data);
}

export async function setAdminMarketFeatured(input: {
  instrumentPublicId: string;
  featured: boolean;
  featureRank?: number;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_set_market_featured', {
    p_instrument_public_id: input.instrumentPublicId,
    p_featured: input.featured,
    p_rank: input.featureRank ?? 100,
    p_reason: input.reason.trim(),
  });
  fail(error, 'We could not update this market feature setting right now. Please try again.');
  return Boolean(data);
}
