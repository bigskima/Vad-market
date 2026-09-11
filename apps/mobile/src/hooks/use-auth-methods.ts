import { useCallback, useEffect, useState } from 'react';

import {
  DEFAULT_PUBLIC_AUTH_METHODS,
  getPublicAuthMethods,
  type PublicAuthMethods,
} from '@/services/auth-methods';

export function useAuthMethods() {
  const [methods, setMethods] = useState<PublicAuthMethods>(DEFAULT_PUBLIC_AUTH_METHODS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await getPublicAuthMethods();
    setMethods(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    void getPublicAuthMethods().then((next) => {
      if (!active) return;
      setMethods(next);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  return { methods, loading, refresh };
}
