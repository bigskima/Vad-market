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
      const next = await getPolicyGateState(userId);
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
    void refresh();
    return subscribeLegalPolicyChanges(() => {
      void refresh();
    });
  }, [refresh]);

  return { ...state, refresh };
}
