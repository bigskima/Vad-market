import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useProductTour } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { ProductTab } from './product-tab-bar';

export function ProductTopBar({
  active,
  email,
  isAdmin,
  canCreate,
  onCreate,
  onAdmin,
  onAccount,
  onSearch,
  onNotices,
  noticeCount = 0,
}: {
  active: ProductTab;
  email: string;
  isAdmin: boolean;
  canCreate: boolean;
  showNavigation?: boolean;
  onNavigate?: (tab: ProductTab) => void;
  onCreate: () => void;
  onAdmin: () => void;
  onAccount: () => void;
  onSearch: () => void;
  onNotices: () => void;
  noticeCount?: number;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const insets = useSafeAreaInsets();
  const { registerTarget } = useProductTour();
  const initial = email.trim().charAt(0).toUpperCase() || 'V';
  const roomy = density.width >= 1024;

  return (
    <View
      style={{
        paddingTop: insets.top,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        zIndex: 20,
      }}
    >
      <View
        style={{
          width: '100%',
          minHeight: density.phone ? 56 : 64,
          paddingHorizontal: density.phone ? theme.spacing.md : theme.spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: density.phone ? theme.spacing.sm : theme.spacing.md,
        }}
      >
        {density.phone ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, minWidth: density.narrow ? 72 : 88 }}>
            <VadLogo size={34} />
            {!density.narrow ? (
              <View style={{ gap: 0 }}>
                <VadText variant="label">VAD</VadText>
                <VadText variant="caption" tone="tertiary" numberOfLines={1}>{active}</VadText>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ minWidth: roomy ? 152 : 116, gap: 1 }}>
            {roomy ? <VadText variant="caption" tone="tertiary">VAD MARKET</VadText> : null}
            <VadText variant="heading" numberOfLines={1}>{active}</VadText>
          </View>
        )}

        <Pressable
          ref={(node) => registerTarget('global-search', node)}
          collapsable={false}
          accessibilityRole="search"
          accessibilityLabel="Search markets"
          onPress={onSearch}
          style={({ pressed }) => ({
            flex: density.phone || !roomy ? 1 : undefined,
            width: density.phone || !roomy ? undefined : Math.min(420, Math.max(280, density.width * 0.29)),
            minWidth: density.phone ? 44 : 180,
            maxWidth: density.phone ? undefined : 420,
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingHorizontal: density.narrow ? theme.spacing.sm : theme.spacing.md,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor: pressed ? theme.colors.brandPrimary : theme.colors.border,
            backgroundColor: theme.colors.background,
            opacity: pressed ? 0.78 : 1,
          })}
        >
          <VadIcon name="search" size={18} tone="tertiary" />
          {!density.narrow ? (
            <VadText variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
              {density.phone ? 'Search' : 'Search markets, topics…'}
            </VadText>
          ) : null}
          {roomy ? (
            <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <VadText variant="caption" tone="tertiary">/</VadText>
            </View>
          ) : null}
        </Pressable>

        {roomy ? <View style={{ flex: 1 }} /> : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          {canCreate && roomy ? (
            <HeaderAction label="Create" icon="plus" brand onPress={onCreate} />
          ) : null}

          {isAdmin && roomy ? (
            <HeaderAction label="Operations" icon="operations" onPress={onAdmin} />
          ) : null}

          <View>
            <HeaderIcon label="Open notices" icon="bell" onPress={onNotices} />
            {noticeCount > 0 ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 3,
                  backgroundColor: theme.colors.no,
                  borderWidth: 2,
                  borderColor: theme.colors.surface,
                }}
              >
                <VadText tone="inverse" style={{ fontSize: 9, lineHeight: 10, fontWeight: '800' }}>{Math.min(9, noticeCount)}</VadText>
              </View>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open account"
            onPress={onAccount}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: active === 'Account' ? theme.colors.brandPrimary : theme.colors.border,
              backgroundColor: active === 'Account' ? theme.colors.brandSoft : theme.colors.surfaceRaised,
              opacity: pressed ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <VadText variant="label" tone={active === 'Account' ? 'brand' : 'primary'}>{initial}</VadText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function HeaderIcon({ label, icon, onPress }: { label: string; icon: 'bell'; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surfaceRaised,
        borderWidth: 1,
        borderColor: theme.colors.border,
      })}
    >
      <VadIcon name={icon} size={19} tone="secondary" />
    </Pressable>
  );
}

function HeaderAction({ label, icon, brand = false, onPress }: { label: string; icon: 'plus' | 'operations'; brand?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.pill,
        backgroundColor: brand ? theme.colors.brandPrimary : theme.colors.surfaceRaised,
        borderWidth: 1,
        borderColor: brand ? theme.colors.brandPrimary : theme.colors.border,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <VadIcon name={icon} size={17} tone={brand ? 'inverse' : 'secondary'} />
      <VadText variant="label" tone={brand ? 'inverse' : 'primary'}>{label}</VadText>
    </Pressable>
  );
}
