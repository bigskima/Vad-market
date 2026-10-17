import * as Location from 'expo-location';

import { supabase } from '@/lib/supabase';

export type LocationVerificationResult = {
  allowed: boolean;
  reasonCode: string;
  expiresAt?: string;
};

export async function verifyCurrentServiceLocation(): Promise<LocationVerificationResult> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    return { allowed: false, reasonCode: 'LOCATION_PERMISSION_REQUIRED' };
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
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
    const responseData = (error as { context?: { body?: { code?: string; reasonCode?: string } } }).context?.body;
    return {
      allowed: false,
      reasonCode: responseData?.reasonCode || responseData?.code || 'LOCATION_VERIFICATION_UNAVAILABLE',
    };
  }

  return {
    allowed: data?.allowed === true,
    reasonCode: String(data?.reasonCode || 'LOCATION_VERIFICATION_UNAVAILABLE'),
    expiresAt: typeof data?.expiresAt === 'string' ? data.expiresAt : undefined,
  };
}
