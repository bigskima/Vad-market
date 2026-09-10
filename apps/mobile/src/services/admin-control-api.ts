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

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function hasAdminPermission(access: AdminAccess, permission: string) {
  return access.isSuperAdmin || access.permissions.includes(permission);
}

export function hasAnyAdminPermission(access: AdminAccess, permissions: string[]) {
  return access.isSuperAdmin || permissions.some((permission) => access.permissions.includes(permission));
}

export async function getAdminAccess() {
  const { data, error } = await supabase.rpc('admin_my_access');
  fail(error);

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
  fail(error);
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
  fail(error);
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
  fail(error);
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
  fail(error);
  return Boolean(data);
}

export async function requestAdminRefund(intentPublicId: string, reason: string) {
  const { data, error } = await supabase.rpc('admin_request_refund', {
    p_intent_public_id: intentPublicId,
    p_reason: reason.trim(),
  });
  fail(error);
  return String(data);
}

export async function closeAdminMarket(instrumentPublicId: string, reason: string) {
  const { data, error } = await supabase.rpc('admin_close_market', {
    p_instrument_public_id: instrumentPublicId,
    p_reason: reason.trim() || null,
  });
  fail(error);
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
  fail(error);
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
  fail(error);
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
  fail(error);
  return Boolean(data);
}

export async function settleAdminMarket(instrumentPublicId: string) {
  const { data, error } = await supabase.rpc('admin_settle_market', {
    p_instrument_public_id: instrumentPublicId,
  });
  fail(error);
  return String(data);
}
