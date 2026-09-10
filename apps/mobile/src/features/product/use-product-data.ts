import { useCallback, useEffect, useMemo, useState } from 'react';

import {
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

type ProductSectionErrors = {
  markets: string | null;
  wallet: string | null;
  positions: string | null;
  orders: string | null;
  proposals: string | null;
};

const emptySectionErrors: ProductSectionErrors = {
  markets: null,
  wallet: null,
  positions: null,
  orders: null,
  proposals: null,
};

function settledError(
  result: PromiseSettledResult<unknown>,
  fallback: string,
) {
  if (result.status === 'fulfilled') return null;
  return result.reason instanceof Error ? result.reason.message : fallback;
}

export function useProductData(enabled = true) {
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] =
    useState<ProductSectionErrors>(emptySectionErrors);
  const [markets, setMarkets] = useState<MarketCatalogItem[]>([]);
  const [wallet, setWallet] = useState<WalletRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [adminSummary, setAdminSummary] = useState<Record<
    string,
    number | string
  > | null>(null);

  const reset = useCallback(() => {
    setMarkets([]);
    setWallet([]);
    setPositions([]);
    setOrders([]);
    setProposals([]);
    setAdminSummary(null);
    setSectionErrors(emptySectionErrors);
    setError(null);
  }, []);

  const probeAdmin = useCallback(async () => {
    if (!enabled) return;

    try {
      setAdminSummary(await getAdminRuntimeSummary());
    } catch {
      // The customer product must never fail because an admin-only probe did.
      setAdminSummary(null);
    }
  }, [enabled]);

  const load = useCallback(async () => {
    if (!enabled) return;

    const results = await Promise.allSettled([
      listMarkets(),
      getWalletSummary(),
      getPositions(),
      getOpenOrders(),
      getMyProposals(),
    ]);

    const nextSectionErrors: ProductSectionErrors = {
      markets: settledError(results[0], 'Markets could not be refreshed.'),
      wallet: settledError(results[1], 'Wallet balances could not be refreshed.'),
      positions: settledError(results[2], 'Positions could not be refreshed.'),
      orders: settledError(results[3], 'Orders could not be refreshed.'),
      proposals: settledError(results[4], 'Market proposals could not be refreshed.'),
    };

    setSectionErrors(nextSectionErrors);

    const failures = Object.values(nextSectionErrors).filter(Boolean).length;
    if (failures === results.length) {
      setError(
        'VAD could not refresh markets or account data. Your last successful data is still shown where available.',
      );
    } else if (failures > 0) {
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

      // Product-critical reads determine the loading shell. The admin probe is
      // deliberately independent so normal users are never held behind an
      // admin-only RPC before Home/Markets/Wallet can render.
      void probeAdmin();
      void load().finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, load, probeAdmin, reset]);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setRefreshing(true);
    try {
      await load();
      void probeAdmin();
    } finally {
      setRefreshing(false);
    }
  }, [enabled, load, probeAdmin]);

  const ngn = useMemo(
    () => wallet.find((row) => row.asset_code === 'NGN') ?? wallet[0],
    [wallet],
  );

  return {
    loading,
    refreshing,
    error,
    sectionErrors,
    markets,
    wallet,
    positions,
    orders,
    proposals,
    adminSummary,
    ngn,
    load,
    refresh,
  };
}
