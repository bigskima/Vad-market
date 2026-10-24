import * as Location from 'expo-location';

import { supabase } from '@/lib/supabase';

export type LocationVerificationResult = {
  allowed: boolean;
  reasonCode: string;
  expiresAt?: string;
};

type VerificationErrorPayload = {
  code?: unknown;
  reasonCode?: unknown;
};

async function readVerificationError(context: unknown): Promise<VerificationErrorPayload> {
  if (context instanceof Response) {
    const payload = await context.clone().json().catch(() => null);
    return payload && typeof payload === 'object' ? payload as VerificationErrorPayload : {};
  }

  if (!context || typeof context !== 'object') return {};
  const value = context as { body?: unknown; code?: unknown; reasonCode?: unknown };
  if (value.body && typeof value.body === 'object') {
    return value.body as VerificationErrorPayload;
  }
  if (typeof value.body === 'string') {
    try {
      const payload: unknown = JSON.parse(value.body);
      return payload && typeof payload === 'object' ? payload as VerificationErrorPayload : {};
    } catch {
      return {};
    }
  }
  return { code: value.code, reasonCode: value.reasonCode };
}

function reasonCodeFrom(payload: VerificationErrorPayload) {
  const value = payload.reasonCode ?? payload.code;
  return typeof value === 'string' && value.trim()
    ? value.trim().toUpperCase()
    : 'LOCATION_VERIFICATION_UNAVAILABLE';
}

export async function verifyCurrentServiceLocation(): Promise<LocationVerificationResult> {
  let permission: Location.LocationPermissionResponse;
  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch {
    return { allowed: false, reasonCode: 'LOCATION_PERMISSION_UNAVAILABLE' };
  }

  if (permission.status !== 'granted') {
    return { allowed: false, reasonCode: 'LOCATION_PERMISSION_REQUIRED' };
  }

  let position: Location.LocationObject;
  try {
    position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  } catch {
    return { allowed: false, reasonCode: 'LOCATION_POSITION_UNAVAILABLE' };
  }

  if (position.coords.accuracy == null || position.coords.accuracy > 1500) {
    return { allowed: false, reasonCode: 'LOCATION_INACCURATE' };
  }

  const { data, error } = await supabase.functions.invoke('verify-service-location', {
    body: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy,
    },
  });

  if (error) {
    const context = (error as { context?: unknown }).context;
    const payload = await readVerificationError(context);
    return { allowed: false, reasonCode: reasonCodeFrom(payload) };
  }

  return {
    allowed: data?.allowed === true,
    reasonCode: String(data?.reasonCode || 'LOCATION_VERIFICATION_UNAVAILABLE'),
    expiresAt: typeof data?.expiresAt === 'string' ? data.expiresAt : undefined,
  };
}

export function locationVerificationMessage(reasonCode: string) {
  switch (reasonCode) {
    case 'LOCATION_PERMISSION_REQUIRED':
      return 'Allow location access in your browser or device settings, then try again.';
    case 'LOCATION_PERMISSION_UNAVAILABLE':
      return 'Your browser could not request location permission. Check browser location settings and try again.';
    case 'LOCATION_POSITION_UNAVAILABLE':
      return 'Your device location could not be read. Turn on device location services and try again.';
    case 'LOCATION_INACCURATE':
      return 'Your location is not accurate enough. Move to an open area and retry.';
    case 'LOCATION_MISMATCH':
      return 'Your device location and network country do not both verify Nigeria.';
    case 'OUTSIDE_NIGERIA':
      return 'NGN market testing requires your current device and network location to be in Nigeria.';
    case 'NETWORK_RISK':
      return 'Disable VPN, proxy, Tor, or hosting-network routing, then retry the location check.';
    case 'NETWORK_RISK_UNRESOLVED':
      return 'The network-risk check returned incomplete data. Please retry shortly.';
    case 'CLIENT_IP_UNAVAILABLE':
      return 'The server could not identify the connection network. Retry from a normal internet connection.';
    case 'LOCATION_PROVIDER_ERROR':
    case 'LOCATION_CHECK_FAILED':
    case 'LOCATION_VERIFICATION_UNAVAILABLE':
      return 'The location-verification service is temporarily unavailable. Please retry shortly.';
    case 'COUNTRY_UNRESOLVED':
      return 'The verification service could not confirm your country. Check location permission and retry.';
    case 'LOCATION_SAVE_FAILED':
      return 'Your location check could not be saved. Please retry shortly.';
    case 'ACCOUNT_NOT_ELIGIBLE':
      return 'Your account country must be set to Nigeria and match the current device and network checks.';
    default:
      return 'Current Nigeria location could not be verified. Check location permission and network settings.';
  }
}
