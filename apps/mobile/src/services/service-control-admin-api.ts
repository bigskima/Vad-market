import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type AdminServiceControlRow = {
  service_key: string;
  name: string;
  description: string;
  category: string;
  user_scopable: boolean;
  inherits_app_pause: boolean;
  global_paused: boolean;
  global_reason: string | null;
  global_resumes_at: string | null;
  active_user_pauses: number;
};

export type AdminServicePostureRow = {
  service_key: string;
  name: string;
  category: string;
  enabled: boolean;
  globally_paused: boolean;
  reason: string | null;
  resumes_at: string | null;
};

export type AdminUserServiceControlRow = {
  service_key: string;
  name: string;
  category: string;
  enabled: boolean;
  reason_code: string | null;
  message: string | null;
  pause_scope: 'GLOBAL' | 'USER' | 'DEFAULT' | null;
  resumes_at: string | null;
};

export type AdminLaunchReadinessGateStatus =
  | 'READY'
  | 'WARNING'
  | 'PAUSED'
  | 'BLOCKED';

export type AdminLaunchReadinessGate = {
  key: string;
  category: string;
  title: string;
  status: AdminLaunchReadinessGateStatus;
  detail: string;
  count?: number;
  mappedProvidersPerPair?: number;
  readyProvidersPerPair?: number;
  readyProviders?: number;
  closeScheduler?: boolean;
  consensusScheduler?: boolean;
  enabledServices?: number;
};

export type AdminLaunchReadiness = {
  generatedAt: string;
  releaseState:
    | 'LIVE_READY'
    | 'MARKET_LIFECYCLE_READY'
    | 'PLATFORM_READY_MARKET_BLOCKED'
    | 'HARDENING_REQUIRED';
  platformReady: boolean;
  marketLifecycleReady: boolean;
  realMoneyReady: boolean;
  blockerCount: number;
  warningCount: number;
  gates: AdminLaunchReadinessGate[];
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback: string) {
  if (error) throw userFacingError(error, 'admin', fallback);
}

export async function getAdminServiceControls() {
  const { data, error } = await supabase.rpc('admin_service_control_catalog');
  fail(error, 'We could not load service controls right now. Refresh and try again.');
  return (data ?? []) as AdminServiceControlRow[];
}

export async function getAdminServicePosture() {
  const { data, error } = await supabase.rpc('admin_service_posture');
  fail(error, 'We could not load service status right now. Refresh and try again.');
  return (data ?? []) as AdminServicePostureRow[];
}

export async function getAdminLaunchReadiness() {
  const { data, error } = await supabase.rpc('admin_launch_readiness');
  fail(error, 'We could not load launch readiness right now. Refresh and try again.');
  return (data ?? null) as AdminLaunchReadiness | null;
}

export async function getAdminUserServiceControls(userId: string) {
  const { data, error } = await supabase.rpc('admin_user_service_controls', {
    p_user_id: userId,
  });
  fail(error, 'We could not load this user’s service access right now. Refresh and try again.');
  return (data ?? []) as AdminUserServiceControlRow[];
}

export async function setAdminServiceControl(input: {
  serviceKey: string;
  paused: boolean;
  reason: string;
  resumesAt?: string | null;
  userId?: string | null;
}) {
  const { data, error } = await supabase.rpc('admin_set_service_control', {
    p_service_key: input.serviceKey,
    p_paused: input.paused,
    p_reason: input.reason.trim(),
    p_resumes_at: input.paused ? input.resumesAt ?? null : null,
    p_user_id: input.userId ?? null,
  });
  fail(error, 'We could not update this service setting right now. Please try again.');
  return (data ?? {}) as Record<string, unknown>;
}
