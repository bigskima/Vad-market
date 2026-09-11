export function runtimeCapabilityReason(
  reason: string | undefined,
  fallback = 'This action is not available right now. Please try again later.',
) {
  switch (reason) {
    case 'AUTHENTICATION_REQUIRED':
      return 'Sign in again to continue.';
    case 'CAPABILITIES_LOADING':
      return 'Checking availability for your account.';
    case 'CAPABILITY_SERVICE_UNAVAILABLE':
    case 'POLICY_CONTEXT_UNAVAILABLE':
    case 'SERVICE_CONTROL_UNAVAILABLE':
      return 'We cannot confirm this action right now. Please try again shortly.';
    case 'ACCOUNT_NOT_ACTIVE':
      return 'This action requires an active VAD account.';
    case 'NO_ACTIVE_POLICY':
      return 'This action is not available for your account right now.';
    case 'NO_ACTIVE_ASSET':
      return 'No supported currency is available in your location right now.';
    case 'PLATFORM_MAINTENANCE':
      return 'VAD is temporarily unavailable for new actions while we make improvements.';
    case 'ACCOUNT_ACTIONS_PAUSED':
      return 'New actions are temporarily unavailable for this account.';
    case 'SERVICE_PAUSED':
      return 'This feature is temporarily unavailable.';
    case 'ACCOUNT_SERVICE_PAUSED':
      return 'This feature is temporarily unavailable for your account.';
    case 'PHASE_2_NOT_ENABLED':
      return 'Deposits and withdrawals are not available for your account yet.';
    case 'PHASE_3_NOT_ENABLED':
      return 'Market creation is not available for your account yet.';
    case 'PHASE_4_NOT_ENABLED':
      return 'Trading is not available for your account yet.';
    default:
      return fallback;
  }
}
