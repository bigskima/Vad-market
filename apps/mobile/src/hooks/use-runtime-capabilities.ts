import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import {
  fetchRuntimeCapabilities,
  unavailableCapabilities,
} from '@/services/runtime-capabilities';

export function useRuntimeCapabilities(session: Session | null) {
  const [snapshot, setSnapshot] = useState(() =>
    unavailableCapabilities('AUTHENTICATION_REQUIRED'),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) {
      setSnapshot(unavailableCapabilities('AUTHENTICATION_REQUIRED'));
      return;
    }

    setIsRefreshing(true);
    try {
      setSnapshot(await fetchRuntimeCapabilities());
    } finally {
      setIsRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;

    let ignore = false;
    void fetchRuntimeCapabilities().then((nextSnapshot) => {
      if (!ignore) setSnapshot(nextSnapshot);
    });

    return () => {
      ignore = true;
    };
  }, [session]);

  return { snapshot, isRefreshing, refresh } as const;
}
