import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import {
  fetchRuntimeCapabilities,
  unavailableCapabilities,
} from '@/services/runtime-capabilities';

type CapabilitySnapshot = ReturnType<typeof unavailableCapabilities>;

type CapabilityState = {
  userId: string;
  snapshot: CapabilitySnapshot;
};

export function useRuntimeCapabilities(session: Session | null) {
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<CapabilityState | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;

    setManualRefreshing(true);
    try {
      const nextSnapshot = await fetchRuntimeCapabilities();
      setState({ userId, snapshot: nextSnapshot });
    } catch {
      setState({ userId, snapshot: unavailableCapabilities() });
    } finally {
      setManualRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    let ignore = false;
    void fetchRuntimeCapabilities()
      .then((nextSnapshot) => {
        if (!ignore) setState({ userId, snapshot: nextSnapshot });
      })
      .catch(() => {
        if (!ignore) {
          setState({ userId, snapshot: unavailableCapabilities() });
        }
      });

    return () => {
      ignore = true;
    };
  }, [userId]);

  // The state is keyed to the authenticated user. A session switch therefore
  // fails closed immediately without carrying the prior user's capabilities
  // while the next server-authoritative snapshot is loading.
  const snapshot = !userId
    ? unavailableCapabilities('AUTHENTICATION_REQUIRED')
    : state?.userId === userId
      ? state.snapshot
      : unavailableCapabilities('CAPABILITIES_LOADING');

  const isRefreshing =
    manualRefreshing || Boolean(userId && state?.userId !== userId);

  return { snapshot, isRefreshing, refresh } as const;
}
