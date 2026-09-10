import type { PropsWithChildren } from 'react';
import {
  Pressable,
  RefreshControl,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadScreen } from '@/components/ui/vad-screen';
import { VadText } from '@/components/ui/vad-text';
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
      {data.warning ? (
        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.warning,
            backgroundColor: theme.colors.warningSoft,
            padding: theme.spacing.md,
            gap: theme.spacing.xs,
          }}
        >
          <VadText variant="caption" tone="warning">
            SOME OPERATIONS DATA MAY BE STALE
          </VadText>
          <VadText variant="caption" tone="secondary">
            {data.warning}
          </VadText>
          <Pressable
            accessibilityRole="button"
            disabled={data.refreshing}
            onPress={() => void data.refresh()}
            style={({ pressed }) => ({
              minHeight: 32,
              alignSelf: 'flex-start',
              justifyContent: 'center',
              opacity: data.refreshing ? 0.45 : pressed ? 0.6 : 1,
            })}
          >
            <VadText variant="label" tone="brand">
              {data.refreshing ? 'Refreshing…' : 'Refresh operations'}
            </VadText>
          </Pressable>
        </View>
      ) : null}

      {children}
    </VadScreen>
  );
}
