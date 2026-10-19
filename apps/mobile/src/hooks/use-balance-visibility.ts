import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = '@vad-market/balance-visibility-hidden';
let cachedHidden: boolean | null = null;
const subscribers = new Set<(hidden: boolean) => void>();

function publishHidden(hidden: boolean) {
  cachedHidden = hidden;
  for (const subscriber of subscribers) subscriber(hidden);
}

export function useBalanceVisibility() {
  const [hidden, setHiddenState] = useState(cachedHidden ?? true);
  const [ready, setReady] = useState(cachedHidden !== null);

  useEffect(() => {
    let active = true;
    const subscribe = (nextHidden: boolean) => {
      if (!active) return;
      setHiddenState(nextHidden);
      setReady(true);
    };

    subscribers.add(subscribe);
    if (cachedHidden !== null) {
      setHiddenState(cachedHidden);
      setReady(true);
    } else {
      void AsyncStorage.getItem(STORAGE_KEY)
        .then((stored) => {
          if (!active) return;
          if (cachedHidden === null) publishHidden(stored !== 'false');
          else {
            setHiddenState(cachedHidden);
            setReady(true);
          }
        })
        .catch(() => {
          if (!active) return;
          if (cachedHidden === null) publishHidden(true);
          else {
            setHiddenState(cachedHidden);
            setReady(true);
          }
        });
    }

    return () => {
      active = false;
      subscribers.delete(subscribe);
    };
  }, []);

  const setHidden = useCallback((nextHidden: boolean) => {
    publishHidden(nextHidden);
    void AsyncStorage.setItem(STORAGE_KEY, String(nextHidden)).catch(() => {
      // Keep the in-memory privacy choice for this app session if storage is unavailable.
    });
  }, []);

  const toggle = useCallback(() => {
    setHidden(!hidden);
  }, [hidden, setHidden]);

  return { hidden, ready, setHidden, toggle };
}
