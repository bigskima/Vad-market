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

export function useProductData() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markets, setMarkets] = useState<MarketCatalogItem[]>([]);
  const [wallet, setWallet] = useState<WalletRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [adminSummary, setAdminSummary] = useState<Record<string, number | string> | null>(null);
  const [adminMarkets, setAdminMarkets] = useState<Record<string, unknown>[]>([]);
  const [adminOracle, setAdminOracle] = useState<Record<string, unknown>[]>([]);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      listMarkets(), getWalletSummary(), getPositions(), getOpenOrders(), getMyProposals(),
      getAdminRuntimeSummary(), getAdminMarketQueue(), getAdminOracleQueue(),
    ]);
    if (results[0].status === 'fulfilled') setMarkets(results[0].value);
    if (results[1].status === 'fulfilled') setWallet(results[1].value);
    if (results[2].status === 'fulfilled') setPositions(results[2].value);
    if (results[3].status === 'fulfilled') setOrders(results[3].value);
    if (results[4].status === 'fulfilled') setProposals(results[4].value);
    if (results[5].status === 'fulfilled') setAdminSummary(results[5].value);
    if (results[6].status === 'fulfilled') setAdminMarkets(results[6].value);
    if (results[7].status === 'fulfilled') setAdminOracle(results[7].value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void load().finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const ngn = useMemo(() => wallet.find((row) => row.asset_code === 'NGN') ?? wallet[0], [wallet]);

  return { loading, refreshing, markets, wallet, positions, orders, proposals, adminSummary, adminMarkets, adminOracle, ngn, load, refresh };
}
