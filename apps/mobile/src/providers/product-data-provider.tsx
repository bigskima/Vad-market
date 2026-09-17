import { createContext, type PropsWithChildren, useContext } from 'react';

import { LiveNotificationOverlay } from '@/features/notifications/live-notification-overlay';
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

  return (
    <ProductDataContext.Provider value={data}>
      {children}
      <LiveNotificationOverlay
        notification={data.liveNotification}
        onDismiss={data.dismissLiveNotification}
        onRead={data.markNotificationRead}
      />
    </ProductDataContext.Provider>
  );
}

export function useProductDataContext() {
  const context = useContext(ProductDataContext);
  if (!context) throw new Error('useProductDataContext must be used within ProductDataProvider.');
  return context;
}
