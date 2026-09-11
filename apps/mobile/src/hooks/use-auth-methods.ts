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
    setMethods(await getPublicAuthMethods());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { methods, loading, refresh };
}
