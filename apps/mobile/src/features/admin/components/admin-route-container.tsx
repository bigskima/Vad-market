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
  const desktop = width >= 900;
  const compact = width < 380;

  return (
    <VadScreen
      scrollProps={{
        keyboardShouldPersistTaps: 'handled',
        contentInsetAdjustmentBehavior: 'automatic',
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
        paddingHorizontal: desktop
          ? theme.spacing.xl
          : compact
            ? theme.spacing.md
            : theme.spacing.lg,
        paddingTop: desktop
          ? theme.spacing.xl
          : compact
            ? theme.spacing.md
            : theme.spacing.lg,
        paddingBottom: theme.spacing.xxxl,
        gap: desktop ? theme.spacing.xxl : theme.spacing.xl,
      }}
    >
      {data.warning ? (
        <View
          accessibilityRole="alert"
          style={{
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.warning,
            paddingVertical: theme.spacing.md,
            flexDirection: width >= 680 ? 'row' : 'column',
            alignItems: width >= 680 ? 'center' : 'stretch',
            gap: theme.spacing.md,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="caption" tone="warning">
              SOME OPERATIONS DATA MAY BE STALE
            </VadText>
            <VadText variant="caption" tone="secondary">
              {data.warning}
            </VadText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh operations data"
            disabled={data.refreshing}
            onPress={() => void data.refresh()}
            style={({ pressed }) => ({
              minHeight: 38,
              alignSelf: width >= 680 ? 'center' : 'flex-start',
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.sm,
              borderWidth: 1,
              borderColor: theme.colors.borderStrong,
              borderRadius: theme.radius.md,
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
