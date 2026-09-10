import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getAdminMarketQueue,
  getAdminOracleQueue,
  getAdminRuntimeSummary,
  getMyProposals,
  getOpenOrders,
  getPositions,
  getWalletSummary,
  listMarkets,
  type MarketCatalogItem,
  type OrderRow,
  type PositionRow,
  type ProposalRow,
  type WalletRow,
} from '@/services/market-api';

export function useProductData(enabled = true) {
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markets, setMarkets] = useState<MarketCatalogItem[]>([]);
  const [wallet, setWallet] = useState<WalletRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [adminSummary, setAdminSummary] = useState<Record<string, number | string> | null>(null);
  const [adminMarkets, setAdminMarkets] = useState<Record<string, unknown>[]>([]);
  const [adminOracle, setAdminOracle] = useState<Record<string, unknown>[]>([]);

  const reset = useCallback(() => {
    setMarkets([]);
    setWallet([]);
    setPositions([]);
    setOrders([]);
    setProposals([]);
    setAdminSummary(null);
    setAdminMarkets([]);
    setAdminOracle([]);
    setError(null);
  }, []);

  const load = useCallback(async () => {
    if (!enabled) return;

    const results = await Promise.allSettled([
      listMarkets(),
      getWalletSummary(),
      getPositions(),
      getOpenOrders(),
      getMyProposals(),
      getAdminRuntimeSummary(),
      getAdminMarketQueue(),
      getAdminOracleQueue(),
    ]);

    const primary = results.slice(0, 5);
    const primaryFailures = primary.filter(
      (result) => result.status === 'rejected',
    ).length;

    if (primaryFailures === primary.length) {
      setError(
        'VAD could not refresh markets or account data. Your last successful data is still shown where available.',
      );
    } else if (primaryFailures > 0) {
      setError(
        'Some VAD data could not refresh. Successful sections were updated and your previous data was preserved elsewhere.',
      );
    } else {
      setError(null);
    }

    if (results[0].status === 'fulfilled') setMarkets(results[0].value);
    if (results[1].status === 'fulfilled') setWallet(results[1].value);
    if (results[2].status === 'fulfilled') setPositions(results[2].value);
    if (results[3].status === 'fulfilled') setOrders(results[3].value);
    if (results[4].status === 'fulfilled') setProposals(results[4].value);
    if (results[5].status === 'fulfilled') setAdminSummary(results[5].value);
    if (results[6].status === 'fulfilled') setAdminMarkets(results[6].value);
    if (results[7].status === 'fulfilled') setAdminOracle(results[7].value);
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(() => {
      if (!enabled) {
        reset();
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setLoading(true);
      void load().finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, load, reset]);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [enabled, load]);

  const ngn = useMemo(
    () => wallet.find((row) => row.asset_code === 'NGN') ?? wallet[0],
    [wallet],
  );

  return {
    loading,
    refreshing,
    error,
    markets,
    wallet,
    positions,
    orders,
    proposals,
    adminSummary,
    adminMarkets,
    adminOracle,
    ngn,
    load,
    refresh,
  };
}
