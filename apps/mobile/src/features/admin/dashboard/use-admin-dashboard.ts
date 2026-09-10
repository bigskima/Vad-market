import { useCallback, useEffect, useState } from 'react';

import {
  getAdminMarketQueue,
  getAdminOracleQueue,
  getAdminRuntimeSummary,
} from '@/services/market-api';
import {
  getAdminKycQueue,
  getAdminOperationsSummary,
  getAdminPaymentQueue,
  type KycQueueRow,
  type OperationsSummary,
  type PaymentQueueRow,
} from '@/services/operations-admin-api';
import {
  getAdminProviderReadiness,
  getProviderChangeQueue,
  type ProviderChangeRequest,
  type ProviderReadinessRow,
} from '@/services/provider-admin-api';

export function useAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<Record<string, number | string> | null>(null);
  const [operations, setOperations] = useState<OperationsSummary | null>(null);
  const [marketQueue, setMarketQueue] = useState<Record<string, unknown>[]>([]);
  const [oracleQueue, setOracleQueue] = useState<Record<string, unknown>[]>([]);
  const [kycQueue, setKycQueue] = useState<KycQueueRow[]>([]);
  const [paymentQueue, setPaymentQueue] = useState<PaymentQueueRow[]>([]);
  const [providers, setProviders] = useState<ProviderReadinessRow[]>([]);
  const [providerChanges, setProviderChanges] = useState<ProviderChangeRequest[]>([]);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      getAdminRuntimeSummary(),
      getAdminOperationsSummary(),
      getAdminMarketQueue(),
      getAdminOracleQueue(),
      getAdminKycQueue(12),
      getAdminPaymentQueue(12),
      getAdminProviderReadiness(),
      getProviderChangeQueue(),
    ]);

    const failures = results.filter(
      (result) => result.status === 'rejected',
    ).length;

    if (failures === results.length) {
      setError(
        'Operations data could not refresh. Existing control-plane data is preserved where available.',
      );
      setWarning(null);
    } else {
      setError(null);
      setWarning(
        failures > 0
          ? 'Some operations data could not refresh. Successful queues were updated while previous data was preserved elsewhere.'
          : null,
      );
    }

    if (results[0].status === 'fulfilled') setRuntime(results[0].value);
    if (results[1].status === 'fulfilled') setOperations(results[1].value);
    if (results[2].status === 'fulfilled') setMarketQueue(results[2].value);
    if (results[3].status === 'fulfilled') setOracleQueue(results[3].value);
    if (results[4].status === 'fulfilled') setKycQueue(results[4].value);
    if (results[5].status === 'fulfilled') setPaymentQueue(results[5].value);
    if (results[6].status === 'fulfilled') setProviders(results[6].value);
    if (results[7].status === 'fulfilled') setProviderChanges(results[7].value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void load().finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return {
    loading,
    refreshing,
    error,
    warning,
    runtime,
    operations,
    marketQueue,
    oracleQueue,
    kycQueue,
    paymentQueue,
    providers,
    providerChanges,
    load,
    refresh,
  };
}
