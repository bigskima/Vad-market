import { useCallback, useEffect, useState } from 'react';

import {
  DEFAULT_PUBLIC_AUTH_METHODS,
  getPublicAuthMethods,
  type PublicAuthMethods,
} from '@/services/auth-methods';

const AUTH_METHODS_TIMEOUT_MS = 5000;

async function getPublicAuthMethodsSafely(): Promise<PublicAuthMethods> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<PublicAuthMethods>((resolve) => {
      timeoutId = setTimeout(() => resolve(DEFAULT_PUBLIC_AUTH_METHODS), AUTH_METHODS_TIMEOUT_MS);
    });
    return await Promise.race([getPublicAuthMethods(), timeout]);
  } catch {
    return DEFAULT_PUBLIC_AUTH_METHODS;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function useAuthMethods() {
  const [methods, setMethods] = useState<PublicAuthMethods>(DEFAULT_PUBLIC_AUTH_METHODS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await getPublicAuthMethodsSafely();
      setMethods(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void getPublicAuthMethodsSafely().then((next) => {
      if (!active) return;
      setMethods(next);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  return { methods, loading, refresh };
}
