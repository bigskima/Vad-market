import { supabase } from '@/lib/supabase';
import { getMyKycStatus, type KycStatus } from '@/services/identity-api';

export const ACCOUNT_ONBOARDING_REMINDER_DAYS = 7;
const FRESH_ACCOUNT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type AccountSetupUser = {
  id: string;
  created_at?: string;
  email?: string;
  phone?: string;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type AccountSetupState = {
  contactConfirmed: boolean;
  contactKind: 'email' | 'phone';
  profileComplete: boolean;
  kycComplete: boolean;
  kycStatus: KycStatus | null;
  mfaEnabled: boolean | null;
};

export function accountOnboardingIsDeferred(
  metadata: Record<string, unknown> | null | undefined,
  now = Date.now(),
) {
  const raw = metadata?.vad_onboarding_deferred_until;
  if (typeof raw !== 'string') return false;
  const until = Date.parse(raw);
  return Number.isFinite(until) && until > now;
}

export function shouldPromptAccountOnboarding(
  user: AccountSetupUser | null | undefined,
  now = Date.now(),
) {
  if (!user) return false;
  const metadata = user.user_metadata ?? {};
  if (metadata.vad_onboarding_completed_at) return false;
  if (accountOnboardingIsDeferred(metadata, now)) return false;
  if (typeof metadata.vad_onboarding_started_at === 'string'
    && metadata.vad_onboarding_started_at.length > 0) return true;

  const createdAt = typeof user.created_at === 'string' ? Date.parse(user.created_at) : Number.NaN;
  if (!Number.isFinite(createdAt)) return false;
  const age = now - createdAt;
  return age >= 0 && age <= FRESH_ACCOUNT_WINDOW_MS;
}

async function updateOnboardingMetadata(
  patch: Record<string, unknown>,
) {
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!data.user) throw new Error('Sign in to update your account setup.');

  const { error } = await supabase.auth.updateUser({
    data: { ...(data.user.user_metadata ?? {}), ...patch },
  });
  if (error) throw error;
}

export async function markAccountOnboardingStarted() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Sign in to continue account setup.');
  const metadata = data.user.user_metadata ?? {};
  await updateOnboardingMetadata({
    vad_onboarding_started_at:
      typeof metadata.vad_onboarding_started_at === 'string'
        ? metadata.vad_onboarding_started_at
        : new Date().toISOString(),
    vad_onboarding_deferred_until: null,
    vad_onboarding_completed_at: null,
  });
}

export async function markAccountOnboardingCompleted() {
  await updateOnboardingMetadata({
    vad_onboarding_completed_at: new Date().toISOString(),
    vad_onboarding_deferred_until: null,
  });
}

export async function deferAccountOnboarding(
  days = ACCOUNT_ONBOARDING_REMINDER_DAYS,
) {
  const remindAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  await updateOnboardingMetadata({
    vad_onboarding_started_at: new Date().toISOString(),
    vad_onboarding_deferred_until: remindAt,
  });
  return remindAt;
}

export async function getAccountSetupState(
  user: AccountSetupUser,
): Promise<AccountSetupState> {
  const [profileResult, kycResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name,handle')
      .eq('user_id', user.id)
      .maybeSingle(),
    getMyKycStatus(),
  ]);

  if (profileResult.error) {
    throw new Error('We could not check your profile status. Please try again.');
  }

  const kycStatus = kycResult ?? null;
  const status = kycStatus?.status;
  const kycComplete = status === 'VERIFIED'
    || status === 'PROVIDER_PENDING'
    || status === 'IN_REVIEW';

  let mfaEnabled: boolean | null = null;
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error) {
      mfaEnabled = (data?.all ?? []).some(
        (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
      );
    }
  } catch {
    // MFA is a recommendation; its availability never blocks account setup.
  }

  return {
    contactConfirmed: Boolean(user.email_confirmed_at || user.phone_confirmed_at),
    contactKind: user.email ? 'email' : 'phone',
    profileComplete: Boolean(
      profileResult.data?.display_name?.trim()
      && profileResult.data?.handle?.trim(),
    ),
    kycComplete,
    kycStatus,
    mfaEnabled,
  };
}

export function isAccountSetupComplete(state: AccountSetupState) {
  return state.contactConfirmed && state.profileComplete && state.kycComplete;
}
