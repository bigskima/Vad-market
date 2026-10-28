import { useGlobalSearchParams } from 'expo-router';
import { type PropsWithChildren, useEffect } from 'react';

import { useAuth } from '@/providers/auth-provider';
import { applyPendingGrowthCode, rememberPendingGrowthCode } from '@/services/growth-attribution';

export function GrowthAttributionBridge({ children }: PropsWithChildren) {
  const { isLoading, session } = useAuth();
  const params = useGlobalSearchParams<{
    ref?: string | string[];
    referral?: string | string[];
    code?: string | string[];
  }>();
  const rawCode = params.ref ?? params.referral ?? params.code;
  const incomingCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  const normalizedCode = typeof incomingCode === 'string' ? incomingCode.trim() : '';

  useEffect(() => {
    if (normalizedCode) rememberPendingGrowthCode(normalizedCode);
  }, [normalizedCode]);

  useEffect(() => {
    if (isLoading || !session) return;
    void applyPendingGrowthCode();
  }, [isLoading, session, normalizedCode]);

  return children;
}
