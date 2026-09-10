import type { PropsWithChildren } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { VadScreen } from '@/components/ui/vad-screen';
import { VadText } from '@/components/ui/vad-text';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { useAdminResponsive } from './use-admin-responsive';

export function AdminRouteContainer({ children }: PropsWithChildren) {
  const theme = useVadTheme();
  const data = useAdminData();
  const responsive = useAdminResponsive();

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
        maxWidth: responsive.contentMaxWidth,
        paddingHorizontal: responsive.desktop
          ? theme.spacing.xl
          : responsive.mobile
            ? theme.spacing.md
            : theme.spacing.lg,
        paddingTop: responsive.desktop
          ? theme.spacing.xl
          : theme.spacing.lg,
        paddingBottom: responsive.desktop ? theme.spacing.xxxl : 112,
        gap: responsive.desktop ? theme.spacing.xxl : theme.spacing.xl,
      }}
    >
      {data.warning ? (
        <View
          accessibilityRole="alert"
          style={{
            borderWidth: 1,
            borderColor: theme.colors.warning,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.warningSoft,
            padding: theme.spacing.md,
            flexDirection: responsive.width >= 680 ? 'row' : 'column',
            alignItems: responsive.width >= 680 ? 'center' : 'stretch',
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
              alignSelf: responsive.width >= 680 ? 'center' : 'flex-start',
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.sm,
              backgroundColor: theme.colors.surface,
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
