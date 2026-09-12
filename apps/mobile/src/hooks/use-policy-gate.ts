import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getPolicyGateState,
  subscribeLegalPolicyChanges,
  type PolicyGateState,
} from '@/features/policy/legal-policy-service';

const OPEN_STATE: PolicyGateState = {
  loading: false,
  enforcementReady: false,
  requiresAcceptance: false,
  requiredDocuments: [],
  documents: [],
  error: null,
};

const POLICY_GATE_TIMEOUT_MS = 8000;

type PolicyGateSnapshot = {
  userId: string | null;
  state: PolicyGateState;
};

async function getPolicyGateStateWithTimeout(userId: string): Promise<PolicyGateState> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<PolicyGateState>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('We could not finish checking the current policies. Check your connection and try again.'));
      }, POLICY_GATE_TIMEOUT_MS);
    });
    return await Promise.race([getPolicyGateState(userId), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function usePolicyGate(userId: string | null | undefined) {
  const activeUserId = userId ?? null;
  const [snapshot, setSnapshot] = useState<PolicyGateSnapshot>(() => ({
    userId: activeUserId,
    state: activeUserId ? { ...OPEN_STATE, loading: true } : OPEN_STATE,
  }));
  const requestSequence = useRef(0);

  const state = snapshot.userId === activeUserId
    ? snapshot.state
    : activeUserId
      ? { ...OPEN_STATE, loading: true }
      : OPEN_STATE;

  const refresh = useCallback(async () => {
    const requestId = ++requestSequence.current;

    if (!activeUserId) {
      setSnapshot({ userId: null, state: OPEN_STATE });
      return;
    }

    setSnapshot((current) => ({
      userId: activeUserId,
      state: current.userId === activeUserId
        ? { ...current.state, loading: true, error: null }
        : { ...OPEN_STATE, loading: true },
    }));

    try {
      const next = await getPolicyGateStateWithTimeout(activeUserId);
      if (requestId !== requestSequence.current) return;
      setSnapshot({ userId: activeUserId, state: next });
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setSnapshot({
        userId: activeUserId,
        state: {
          ...OPEN_STATE,
          loading: false,
          enforcementReady: true,
          requiresAcceptance: true,
          error: error instanceof Error
            ? error.message
            : 'We could not confirm the policies for your account. Please try again.',
        },
      });
    }
  }, [activeUserId]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const unsubscribe = subscribeLegalPolicyChanges(refresh);
    return () => {
      requestSequence.current += 1;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [refresh]);

  return { ...state, refresh };
}
