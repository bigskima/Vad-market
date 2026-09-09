import type { PropsWithChildren } from 'react';
import { RefreshControl } from 'react-native';

import { VadScreen } from '@/components/ui/vad-screen';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminRouteContainer({ children }: PropsWithChildren) {
  const theme = useVadTheme();
  const data = useAdminData();

  return (
    <VadScreen
      scrollProps={{
        refreshControl: (
          <RefreshControl
            refreshing={data.refreshing}
            onRefresh={data.refresh}
            tintColor={theme.colors.brandPrimary}
            colors={[theme.colors.brandPrimary]}
          />
        ),
      }}
      contentStyle={{
        alignSelf: 'center',
        width: '100%',
        maxWidth: 1180,
        paddingTop: theme.spacing.xl,
        paddingBottom: theme.spacing.xxxl,
        gap: theme.spacing.xl,
      }}
    >
      {children}
    </VadScreen>
  );
}
