import { router, usePathname } from 'expo-router';
import { type ReactNode, useEffect, useRef } from 'react';

import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import {
  getAccountSetupState,
  isAccountSetupComplete,
  markAccountOnboardingCompleted,
  markAccountOnboardingStarted,
  shouldPromptAccountOnboarding,
} from '@/services/account-onboarding-api';

export function AccountOnboardingBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isLoading, session } = useAuth();
  const productData = useProductDataContext();
  const checkedUsers = useRef(new Set<string>());
  const user = session?.user;

  useEffect(() => {
    if (isLoading || productData.loading || !user || pathname === '/onboarding') return;
    if (!shouldPromptAccountOnboarding(user)) return;
    if (checkedUsers.current.has(user.id)) return;

    checkedUsers.current.add(user.id);
    let cancelled = false;

    void (async () => {
      try {
        const state = await getAccountSetupState(user);
        if (cancelled) return;

        if (isAccountSetupComplete(state)) {
          await markAccountOnboardingCompleted();
          return;
        }

        try {
          await markAccountOnboardingStarted();
        } catch {
          // The guided screen remains available; a metadata write must not lock
          // a signed-in member out of the product.
        }
        if (!cancelled) {
          router.replace({ pathname: '/onboarding', params: { source: 'auto' } });
        }
      } catch {
        // An unavailable setup check should be explained on the onboarding
        // screen and must still offer a persisted "remind me later" action.
        try {
          await markAccountOnboardingStarted();
        } catch {
          // Route to the retry/skip surface even if metadata is unavailable.
        }
        if (!cancelled) {
          router.replace({ pathname: '/onboarding', params: { source: 'auto' } });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoading, pathname, productData.loading, user?.id]);

  return children;
}
