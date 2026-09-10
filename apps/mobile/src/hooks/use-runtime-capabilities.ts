import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import {
  fetchRuntimeCapabilities,
  unavailableCapabilities,
} from '@/services/runtime-capabilities';

export function useRuntimeCapabilities(session: Session | null) {
  const userId = session?.user.id ?? null;
  const [snapshot, setSnapshot] = useState(() =>
    unavailableCapabilities('AUTHENTICATION_REQUIRED'),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setSnapshot(unavailableCapabilities('AUTHENTICATION_REQUIRED'));
      setIsRefreshing(false);
      return;
    }

    setIsRefreshing(true);
    try {
      setSnapshot(await fetchRuntimeCapabilities());
    } catch {
      setSnapshot(unavailableCapabilities());
    } finally {
      setIsRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    let ignore = false;

    if (!userId) {
      setSnapshot(unavailableCapabilities('AUTHENTICATION_REQUIRED'));
      setIsRefreshing(false);
      return () => {
        ignore = true;
      };
    }

    // Never carry capabilities from a previous session into a new user while
    // the server-authoritative snapshot is still loading.
    setSnapshot(unavailableCapabilities('CAPABILITIES_LOADING'));
    setIsRefreshing(true);

    void fetchRuntimeCapabilities()
      .then((nextSnapshot) => {
        if (!ignore) setSnapshot(nextSnapshot);
      })
      .catch(() => {
        if (!ignore) setSnapshot(unavailableCapabilities());
      })
      .finally(() => {
        if (!ignore) setIsRefreshing(false);
      });

    return () => {
      ignore = true;
    };
  }, [userId]);

  return { snapshot, isRefreshing, refresh } as const;
}
