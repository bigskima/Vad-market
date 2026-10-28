import { router, usePathname } from 'expo-router';
import { type ReactNode, useEffect, useRef } from 'react';

import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import {
  getAccountSetupState,
  isAccountOnboardingComplete,
  markAccountOnboardingCompleted,
  shouldPromptAccountOnboarding,
} from '@/services/account-onboarding-api';

export function AccountOnboardingBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isLoading, session } = useAuth();
  const productData = useProductDataContext();
  const checkedUsers = useRef(new Map<string, number | null>());
  const user = session?.user;

  useEffect(() => {
    if (isLoading || productData.loading || !user) return;
    if (pathname === '/onboarding') {
      // Let a member move between the setup checklist and the destination
      // screens for a step without bouncing straight back to the checklist.
      checkedUsers.current.set(user.id, null);
      return;
    }

    const deferredUntilRaw = user.user_metadata?.vad_onboarding_deferred_until;
    const deferredUntil = typeof deferredUntilRaw === 'string'
      ? Date.parse(deferredUntilRaw)
      : Number.NaN;
    if (Number.isFinite(deferredUntil) && deferredUntil > Date.now()) {
      checkedUsers.current.set(user.id, deferredUntil);
      return;
    }

    if (!shouldPromptAccountOnboarding(user)) return;
    const previousCheck = checkedUsers.current.get(user.id);
    if (checkedUsers.current.has(user.id)
      && (previousCheck === null || (previousCheck !== undefined && previousCheck > Date.now()))) return;

    checkedUsers.current.set(user.id, null);
    let cancelled = false;

    void (async () => {
      try {
        const state = await getAccountSetupState(user, { includeMilestones: true });
        if (cancelled) return;

        if (isAccountOnboardingComplete(state)) {
          try {
            await markAccountOnboardingCompleted();
          } catch {
            // The account is ready even if the completion marker cannot be
            // saved right now. Retry on a later visit without blocking access.
          }
          return;
        }

        if (!cancelled) {
          // Route first. The onboarding screen persists its started marker so
          // updating Supabase auth metadata cannot cancel this navigation.
          router.replace({ pathname: '/onboarding', params: { source: 'auto' } });
        }
      } catch {
        // An unavailable setup check should be explained on the onboarding
        // screen and must still offer a persisted "remind me later" action.
        if (!cancelled) {
          // The checklist provides a retry and a persisted reminder when a
          // status service is temporarily unavailable.
          router.replace({ pathname: '/onboarding', params: { source: 'auto' } });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoading, pathname, productData.loading, user]);

  return children;
}
