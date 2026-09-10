import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadIconButton } from '@/components/ui/vad-icon-button';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { PRODUCT_TABS, type ProductTab } from './product-tab-bar';

export function ProductTopBar({
  active,
  email,
  isAdmin,
  canCreate,
  showNavigation = false,
  onNavigate,
  onCreate,
  onAdmin,
  onAccount,
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
}) {
  const theme = useVadTheme();
  const insets = useSafeAreaInsets();
  const initial = email.trim().charAt(0).toUpperCase() || 'V';

  return (
    <View
      style={{
        paddingTop: insets.top + theme.spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 1180,
          alignSelf: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          minHeight: 58,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <VadLogo size={36} />
          <View style={{ gap: 1 }}>
            <VadText variant="label">VAD</VadText>
            {!showNavigation ? (
              <VadText variant="caption" tone="secondary">{active}</VadText>
            ) : null}
          </View>
        </View>

        {showNavigation && onNavigate ? (
          <View
            accessibilityRole="tablist"
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.xs,
            }}
          >
            {PRODUCT_TABS.map((tab) => {
              const selected = tab.value === active;
              return (
                <Pressable
                  key={tab.value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => onNavigate(tab.value)}
                  style={({ pressed }) => ({
                    minHeight: 40,
                    borderRadius: theme.radius.pill,
                    justifyContent: 'center',
                    paddingHorizontal: theme.spacing.md,
                    backgroundColor: selected ? theme.colors.brandSoft : 'transparent',
                    opacity: pressed ? 0.66 : 1,
                  })}
                >
                  <VadText variant="caption" tone={selected ? 'brand' : 'secondary'}>
                    {tab.label}
                  </VadText>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          {canCreate ? (
            <VadIconButton
              icon="plus"
              label="Propose a market"
              variant="brand"
              size={40}
              onPress={onCreate}
            />
          ) : null}

          {isAdmin ? (
            <VadIconButton
              icon="operations"
              label="Open VAD operations"
              variant="tonal"
              size={40}
              onPress={onAdmin}
            />
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open account"
            onPress={onAccount}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
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
