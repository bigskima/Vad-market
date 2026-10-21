import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';

import { LiveNotificationOverlay } from '@/features/notifications/live-notification-overlay';
import { WinnerCelebrationOverlay } from '@/features/portfolio/winner-celebration-overlay';
import {
  filterAssetRows,
  filterMarketsByAssets,
  isAssetScopedNotificationVisible,
  isGenericContentVisible,
  normalizeActiveAssetCodes,
} from '@/features/policy/asset-visibility';
import { useProductData } from '@/features/product/use-product-data';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';

type ProductDataValue = ReturnType<typeof useProductData> & {
  activeAssetCodes: string[];
  countryCode: string;
};

const ProductDataContext = createContext<ProductDataValue | null>(null);

export function ProductDataProvider({ children }: PropsWithChildren) {
  const { isLoading, session } = useAuth();
  const data = useProductData(
    !isLoading && Boolean(session),
    session?.user.id ?? null,
  );
  const { snapshot: runtimeCapabilities } = useRuntimeCapabilities(session);
  const activeAssetCodes = useMemo(
    () => normalizeActiveAssetCodes(runtimeCapabilities.context.activeAssetCodes),
    [runtimeCapabilities.context.activeAssetCodes],
  );

  const visibleData = useMemo<ProductDataValue>(() => {
    const markets = filterMarketsByAssets(data.markets, activeAssetCodes);
    const realLedgerAssetCodes = activeAssetCodes.filter((code) => code !== 'TNGN');
    const visibleMarketIds = new Set(markets.map((market) => market.instrument_public_id));
    const realMoneyMarketIds = new Set(markets.filter((market) => market.asset_code !== 'TNGN').map((market) => market.instrument_public_id));
    const notifications = data.notifications.filter((notification) =>
      isAssetScopedNotificationVisible(notification, realLedgerAssetCodes, realMoneyMarketIds),
    );
    const liveNotification = data.liveNotification &&
      isAssetScopedNotificationVisible(data.liveNotification, realLedgerAssetCodes, realMoneyMarketIds)
        ? data.liveNotification
        : null;

    return {
      ...data,
      activeAssetCodes,
      countryCode: runtimeCapabilities.context.countryCode,
      markets,
      // TNGN rows are supplied by the isolated demo-account RPCs, not the real finance ledger.
      wallet: filterAssetRows(data.wallet, activeAssetCodes),
      walletActivity: filterAssetRows(data.walletActivity, activeAssetCodes),
      positions: filterAssetRows(data.positions, realLedgerAssetCodes),
      orders: filterAssetRows(data.orders, realLedgerAssetCodes),
      // TNGN prediction stakes come from my_tngn_market_orders and remain isolated from real-money stakes.
      poolStakes: filterAssetRows(data.poolStakes, activeAssetCodes),
      // TNGN history is reconstructed from the isolated demo-order RPC, not the real-money history table.
      marketHistory: filterAssetRows(data.marketHistory, activeAssetCodes),
      settlements: filterAssetRows(data.settlements, realLedgerAssetCodes),
      notifications,
      liveNotification,
      homePromotions: data.homePromotions.filter((promotion) =>
        isGenericContentVisible([promotion.title, promotion.body], activeAssetCodes),
      ),
      publicNotices: data.publicNotices.filter((notice) =>
        isGenericContentVisible([notice.message], activeAssetCodes),
      ),
      vadMarkets: data.vadMarkets.filter((row) => visibleMarketIds.has(row.instrument_public_id)),
      featuredMarkets: data.featuredMarkets.filter((row) => visibleMarketIds.has(row.instrument_public_id)),
      trendingMarkets: data.trendingMarkets.filter((row) => visibleMarketIds.has(row.instrument_public_id)),
    };
  }, [activeAssetCodes, data, runtimeCapabilities.context.countryCode]);

  const winRefreshKey = useMemo(
    () => visibleData.marketHistory
      .filter((row) => row.result === 'WON' && row.settled_at)
      .map((row) => `${row.market_id}:${row.selected_outcome}:${row.settled_at}`)
      .join('|'),
    [visibleData.marketHistory],
  );
  const liveNotification = visibleData.liveNotification?.notification_type === 'PAYOUT_CREDITED'
    ? null
    : visibleData.liveNotification;

  return (
    <ProductDataContext.Provider value={visibleData}>
      {children}
      <LiveNotificationOverlay
        notification={liveNotification}
        onDismiss={visibleData.dismissLiveNotification}
        onRead={visibleData.markNotificationRead}
      />
      <WinnerCelebrationOverlay refreshKey={winRefreshKey} />
    </ProductDataContext.Provider>
  );
}

export function useProductDataContext() {
  const context = useContext(ProductDataContext);
  if (!context) throw new Error('useProductDataContext must be used within ProductDataProvider.');
  return context;
}
