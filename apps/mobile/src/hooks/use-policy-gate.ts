import { useCallback, useEffect, useState } from 'react';

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
  const [state, setState] = useState<PolicyGateState>(
    userId ? { ...OPEN_STATE, loading: true } : OPEN_STATE,
  );

  const refresh = useCallback(async () => {
    if (!userId) {
      setState(OPEN_STATE);
      return;
    }

    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const next = await getPolicyGateStateWithTimeout(userId);
      setState(next);
    } catch (error) {
      setState({
        ...OPEN_STATE,
        loading: false,
        enforcementReady: true,
        requiresAcceptance: true,
        error: error instanceof Error
          ? error.message
          : 'We could not confirm the policies for your account. Please try again.',
      });
    }
  }, [userId]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const unsubscribe = subscribeLegalPolicyChanges(refresh);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [refresh]);

  return { ...state, refresh };
}
