import { useCallback, useEffect, useState } from 'react';

import {
  hasAdminPermission,
  hasAnyAdminPermission,
  type AdminAccess,
} from '@/services/admin-control-api';
import {
  getAdminFinanceSummary,
  type AdminFinanceSummary,
} from '@/services/finance-admin-api';
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

export function useAdminDashboard(access: AdminAccess) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<Record<string, number | string> | null>(null);
  const [operations, setOperations] = useState<OperationsSummary | null>(null);
  const [finance, setFinance] = useState<AdminFinanceSummary | null>(null);
  const [marketQueue, setMarketQueue] = useState<Record<string, unknown>[]>([]);
  const [oracleQueue, setOracleQueue] = useState<Record<string, unknown>[]>([]);
  const [kycQueue, setKycQueue] = useState<KycQueueRow[]>([]);
  const [paymentQueue, setPaymentQueue] = useState<PaymentQueueRow[]>([]);
  const [providers, setProviders] = useState<ProviderReadinessRow[]>([]);
  const [providerChanges, setProviderChanges] = useState<ProviderChangeRequest[]>([]);

  const load = useCallback(async () => {
    const tasks: Promise<void>[] = [];
    let attempted = 0;
    let failures = 0;

    function queue<T>(
      allowed: boolean,
      request: () => Promise<T>,
      apply: (value: T) => void,
    ) {
      if (!allowed) return;
      attempted += 1;
      tasks.push(
        request()
          .then(apply)
          .catch(() => {
            failures += 1;
          }),
      );
    }

    queue(
      hasAnyAdminPermission(access, [
        'markets.manage',
        'finance.read',
        'oracle.review',
      ]),
      getAdminRuntimeSummary,
      setRuntime,
    );

    queue(
      hasAnyAdminPermission(access, [
        'compliance.manage',
        'finance.read',
        'providers.manage',
        'support.read',
      ]),
      getAdminOperationsSummary,
      setOperations,
    );

    queue(
      hasAdminPermission(access, 'finance.read'),
      getAdminFinanceSummary,
      setFinance,
    );

    queue(
      hasAdminPermission(access, 'markets.manage'),
      getAdminMarketQueue,
      setMarketQueue,
    );

    queue(
      hasAdminPermission(access, 'oracle.review'),
      getAdminOracleQueue,
      setOracleQueue,
    );

    queue(
      hasAnyAdminPermission(access, ['compliance.manage', 'support.read']),
      () => getAdminKycQueue(30),
      setKycQueue,
    );

    queue(
      hasAnyAdminPermission(access, ['finance.read', 'providers.manage']),
      () => getAdminPaymentQueue(30),
      setPaymentQueue,
    );

    queue(
      hasAnyAdminPermission(access, ['providers.manage', 'finance.read']),
      getAdminProviderReadiness,
      setProviders,
    );

    queue(
      hasAdminPermission(access, 'providers.manage'),
      getProviderChangeQueue,
      setProviderChanges,
    );

    await Promise.all(tasks);

    if (attempted === 0) {
      setError(null);
      setWarning(null);
      return;
    }

    if (failures === attempted) {
      setError(
        'Your permitted operations data could not refresh. Existing control-plane data is preserved where available.',
      );
      setWarning(null);
      return;
    }

    setError(null);
    setWarning(
      failures > 0
        ? 'Some permitted operations data could not refresh. Successful queues were updated while previous data was preserved elsewhere.'
        : null,
    );
  }, [access]);

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
    access,
    loading,
    refreshing,
    error,
    warning,
    runtime,
    operations,
    finance,
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
