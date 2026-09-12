import { type PropsWithChildren, useEffect } from 'react';

import { useAuth } from '@/providers/auth-provider';
import { applyPendingGrowthCode } from '@/services/growth-attribution';

export function GrowthAttributionBridge({ children }: PropsWithChildren) {
  const { isLoading, session } = useAuth();

  useEffect(() => {
    if (isLoading || !session) return;
    void applyPendingGrowthCode();
  }, [isLoading, session]);

  return children;
}
