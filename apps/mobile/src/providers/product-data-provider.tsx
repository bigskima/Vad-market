import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';

import { LiveNotificationOverlay } from '@/features/notifications/live-notification-overlay';
import { WinnerCelebrationOverlay } from '@/features/portfolio/winner-celebration-overlay';
import { useProductData } from '@/features/product/use-product-data';
import { useAuth } from '@/providers/auth-provider';

type ProductDataValue = ReturnType<typeof useProductData>;

const ProductDataContext = createContext<ProductDataValue | null>(null);

export function ProductDataProvider({ children }: PropsWithChildren) {
  const { isLoading, session } = useAuth();
  const data = useProductData(
    !isLoading && Boolean(session),
    session?.user.id ?? null,
  );
  const winRefreshKey = useMemo(
    () => data.marketHistory
      .filter((row) => row.result === 'WON' && row.settled_at)
      .map((row) => `${row.market_id}:${row.selected_outcome}:${row.settled_at}`)
      .join('|'),
    [data.marketHistory],
  );

  return (
    <ProductDataContext.Provider value={data}>
      {children}
      <LiveNotificationOverlay
        notification={data.liveNotification}
        onDismiss={data.dismissLiveNotification}
        onRead={data.markNotificationRead}
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
