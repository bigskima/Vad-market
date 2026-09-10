import type { PropsWithChildren } from 'react';
import { RefreshControl, useWindowDimensions } from 'react-native';

import { VadScreen } from '@/components/ui/vad-screen';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminRouteContainer({ children }: PropsWithChildren) {
  const theme = useVadTheme();
  const data = useAdminData();
  const { width } = useWindowDimensions();
  const compact = width < 380;

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
        paddingHorizontal: compact
          ? theme.spacing.md
          : theme.spacing.lg,
        paddingTop: compact
          ? theme.spacing.lg
          : theme.spacing.xl,
        paddingBottom: theme.spacing.xxxl,
        gap: theme.spacing.xl,
      }}
    >
      {children}
    </VadScreen>
  );
}
