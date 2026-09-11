import { useEffect, useState } from 'react';

import {
  getPolicyGateState,
  type PolicyGateState,
} from '@/features/policy/legal-policy-service';

const OPEN_STATE: PolicyGateState = {
  loading: false,
  enforcementReady: false,
  requiresAcceptance: false,
  requiredDocuments: [],
};

export function usePolicyGate(userId: string | null | undefined) {
  const [state, setState] = useState<PolicyGateState>(OPEN_STATE);

  useEffect(() => {
    let mounted = true;
    if (!userId) {
      const timer = setTimeout(() => {
        if (mounted) setState(OPEN_STATE);
      }, 0);
      return () => {
        mounted = false;
        clearTimeout(timer);
      };
    }

    void getPolicyGateState(userId).then((next) => {
      if (mounted) setState(next);
    });

    return () => {
      mounted = false;
    };
  }, [userId]);

  return state;
}
