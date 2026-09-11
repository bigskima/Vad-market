export type UserErrorContext =
  | 'general'
  | 'authentication'
  | 'signIn'
  | 'signUp'
  | 'password'
  | 'phoneVerification'
  | 'identityVerification'
  | 'payments'
  | 'deposit'
  | 'withdrawal'
  | 'markets'
  | 'trading'
  | 'portfolio'
  | 'proposal'
  | 'social'
  | 'profile'
  | 'admin';

const FALLBACKS: Record<UserErrorContext, string> = {
  general: 'Something went wrong. Please try again.',
  authentication: 'We could not complete this account request right now. Please try again.',
  signIn: 'Unable to sign in right now. Please try again.',
  signUp: 'Unable to create your account right now. Please try again.',
  password: 'We could not complete this password request right now. Please try again.',
  phoneVerification: 'We could not complete phone verification right now. Please try again shortly.',
  identityVerification: 'Identity verification is temporarily unavailable. Please try again shortly.',
  payments: 'We could not complete this payment request right now. Please try again.',
  deposit: 'We could not start your deposit right now. Please try again.',
  withdrawal: 'We could not start your withdrawal right now. Please try again.',
  markets: 'We could not load market information right now. Please try again.',
  trading: 'We could not complete this trade right now. Please try again.',
  portfolio: 'We could not load your portfolio right now. Please try again.',
  proposal: 'We could not submit this market proposal right now. Please try again.',
  social: 'We could not complete that community action right now. Please try again.',
  profile: 'We could not update your profile right now. Please try again.',
  admin: 'This request could not be completed. Refresh and try again.',
};

function readRawError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return '';

  const value = error as {
    message?: unknown;
    error?: unknown;
    details?: unknown;
    hint?: unknown;
    code?: unknown;
  };

  return [value.message, value.error, value.details, value.hint, value.code]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .join(' ');
}

function hasAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

/**
 * Converts external/auth/database/function errors into launch-safe copy.
 *
 * Important: the default path never echoes the server message. This prevents
 * provider names, database details, function names, secrets/configuration
 * hints, stack-like text, and other implementation details from reaching UI.
 */
export function userFacingErrorMessage(
  error: unknown,
  context: UserErrorContext = 'general',
  fallback?: string,
) {
  const raw = readRawError(error).toLowerCase();

  if (hasAny(raw, ['failed to fetch', 'network request failed', 'networkerror', 'network error', 'fetch failed', 'offline'])) {
    return 'We could not connect. Check your internet connection and try again.';
  }

  if (hasAny(raw, ['timeout', 'timed out', 'deadline exceeded'])) {
    return 'This is taking longer than expected. Please try again.';
  }

  if (hasAny(raw, ['rate limit', 'too many requests', 'too many attempts', '429'])) {
    return 'Too many attempts. Wait a moment, then try again.';
  }

  if (hasAny(raw, ['invalid login credentials', 'invalid credentials'])) {
    return 'The email or password is incorrect. Check both fields and try again.';
  }

  if (hasAny(raw, ['email not confirmed', 'email_not_confirmed'])) {
    return 'Confirm your email address before signing in.';
  }

  if (hasAny(raw, ['user already registered', 'already been registered', 'email already exists'])) {
    return 'An account already exists for this email. Sign in instead.';
  }

  if (
    hasAny(raw, ['weak password', 'password should', 'password must', 'password is too short'])
    || (raw.includes('password') && raw.includes('characters'))
  ) {
    return 'Choose a stronger password and try again.';
  }

  if (hasAny(raw, ['otp expired', 'token has expired', 'expired otp', 'expired token'])) {
    return 'That verification code has expired. Request a new code and try again.';
  }

  if (hasAny(raw, ['invalid otp', 'invalid token', 'token is invalid', 'otp is invalid'])) {
    return 'That verification code is not valid. Check the code and try again.';
  }

  if (
    hasAny(raw, [
      'jwt expired',
      'invalid jwt',
      'auth session missing',
      'session not found',
      'refresh token',
      'not authenticated',
      'authentication required',
      'unauthorized',
      '401',
    ])
  ) {
    return 'Your session has expired. Sign in again to continue.';
  }

  if (
    hasAny(raw, [
      'permission denied',
      'row-level security',
      'row level security',
      'rls',
      'not permitted',
      'forbidden',
      '42501',
      '403',
    ])
  ) {
    return 'You do not have permission to do that.';
  }

  if (hasAny(raw, ['insufficient balance', 'insufficient funds', 'not enough balance'])) {
    return 'Your available balance is not enough for this request.';
  }

  if (hasAny(raw, ['insufficient shares', 'not enough shares', 'available shares'])) {
    return 'You do not have enough available shares for this order.';
  }

  if (hasAny(raw, ['market closed', 'market is closed', 'trading closed', 'market not open', 'market is not open'])) {
    return 'This market is no longer open for trading.';
  }

  if (hasAny(raw, ['duplicate', 'idempotency', 'already submitted', 'already exists'])) {
    return 'This request may already have been submitted. Refresh before trying again.';
  }

  if (
    hasAny(raw, [
      'kyc_provider_not_configured',
      'provider_not_configured',
      'provider not configured',
      'identity-gateway',
      'didit',
      'kyc secret',
      'verification secret',
    ])
  ) {
    return FALLBACKS.identityVerification;
  }

  if (
    hasAny(raw, [
      'payment provider',
      'deposit provider',
      'withdrawal provider',
      'payment route',
      'provider secret',
    ])
  ) {
    return context === 'deposit'
      ? FALLBACKS.deposit
      : context === 'withdrawal'
        ? FALLBACKS.withdrawal
        : FALLBACKS.payments;
  }

  if (hasAny(raw, ['no active asset', 'asset not active', 'unsupported asset', 'unsupported currency'])) {
    return 'This currency is not available for your account right now.';
  }

  if (
    hasAny(raw, [
      'check constraint',
      'invalid input syntax',
      'validation failed',
      'invalid request',
      'bad request',
      '22023',
      '23514',
      '400',
    ])
  ) {
    return 'Check the information you entered and try again.';
  }

  if (context === 'profile' && hasAny(raw, ['payload too large', 'file too large', '413'])) {
    return 'That image is too large. Choose a smaller image and try again.';
  }

  // Treat infrastructure, database, API, function and configuration failures as
  // opaque. Users receive a useful recovery action without implementation data.
  if (
    hasAny(raw, [
      'internal server error',
      'server error',
      '500',
      '502',
      '503',
      '504',
      'postgres',
      'postgrest',
      'pgrst',
      'supabase',
      'rpc',
      'function',
      'edge function',
      'environment variable',
      'api key',
      'secret',
      'not configured',
      'configuration',
      'schema',
      'relation',
      'column',
      'sqlstate',
    ])
  ) {
    return fallback ?? FALLBACKS[context];
  }

  return fallback ?? FALLBACKS[context];
}

export function userFacingError(
  error: unknown,
  context: UserErrorContext = 'general',
  fallback?: string,
) {
  return new Error(userFacingErrorMessage(error, context, fallback));
}
