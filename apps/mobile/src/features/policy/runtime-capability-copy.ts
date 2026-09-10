export function runtimeCapabilityReason(
  reason: string | undefined,
  fallback = 'This action is not available under the current VAD policy.',
) {
  switch (reason) {
    case 'AUTHENTICATION_REQUIRED':
      return 'Sign in again so VAD can confirm which actions are available to your account.';
    case 'CAPABILITIES_LOADING':
      return 'VAD is confirming the actions available to this account.';
    case 'CAPABILITY_SERVICE_UNAVAILABLE':
    case 'POLICY_CONTEXT_UNAVAILABLE':
    case 'SERVICE_CONTROL_UNAVAILABLE':
      return 'VAD cannot confirm this action right now. Try again shortly.';
    case 'ACCOUNT_NOT_ACTIVE':
      return 'This action requires an active VAD account.';
    case 'NO_ACTIVE_POLICY':
      return 'This action has not been enabled by the current VAD launch policy.';
    case 'NO_ACTIVE_ASSET':
      return 'No eligible settlement asset is active for this account location.';
    case 'PLATFORM_MAINTENANCE':
      return 'VAD is temporarily in read-only maintenance mode.';
    case 'ACCOUNT_ACTIONS_PAUSED':
      return 'New actions are temporarily paused for this account.';
    case 'SERVICE_PAUSED':
      return 'This VAD service is temporarily paused.';
    case 'ACCOUNT_SERVICE_PAUSED':
      return 'This service is temporarily paused for this account.';
    case 'PHASE_2_NOT_ENABLED':
      return 'This financial action is not enabled in the current VAD launch phase.';
    case 'PHASE_3_NOT_ENABLED':
      return 'Market proposals are not enabled in the current VAD launch phase.';
    case 'PHASE_4_NOT_ENABLED':
      return 'Trading and portfolio access are not enabled in the current VAD launch phase.';
    default:
      return fallback;
  }
}
