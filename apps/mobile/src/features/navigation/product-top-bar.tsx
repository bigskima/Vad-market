import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
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
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 1180,
          alignSelf: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          minHeight: 54,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <VadLogo size={34} />
          <View style={{ gap: 1 }}>
            <VadText variant="caption" tone="tertiary">VAD</VadText>
            {!showNavigation ? (
              <VadText variant="bodyStrong">{active}</VadText>
            ) : null}
          </View>
        </View>

        {showNavigation && onNavigate ? (
          <View
            accessibilityRole="tablist"
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'stretch',
              justifyContent: 'center',
              gap: theme.spacing.md,
              alignSelf: 'stretch',
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
                    minHeight: 46,
                    justifyContent: 'center',
                    borderBottomWidth: 2,
                    borderBottomColor: selected
                      ? theme.colors.brandPrimary
                      : 'transparent',
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <VadText
                    variant="caption"
                    tone={selected ? 'brand' : 'secondary'}
                  >
                    {tab.label}
                  </VadText>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
        >
          {canCreate ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Propose a market"
              onPress={onCreate}
              style={({ pressed }) => ({
                minHeight: 38,
                justifyContent: 'center',
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.brandPrimary,
                paddingHorizontal: showNavigation
                  ? theme.spacing.md
                  : theme.spacing.sm,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <VadText variant="caption" tone="inverse">
                {showNavigation ? 'Create market' : '+'}
              </VadText>
            </Pressable>
          ) : null}

          {isAdmin ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open VAD operations"
              onPress={onAdmin}
              style={({ pressed }) => ({
                minHeight: 38,
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.sm,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <VadText variant="caption" tone="brand">
                {showNavigation ? 'Operations' : 'Ops'}
              </VadText>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open account"
            onPress={onAccount}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor:
                active === 'Account'
                  ? theme.colors.brandPrimary
                  : theme.colors.borderStrong,
              backgroundColor:
                active === 'Account'
                  ? theme.colors.brandSoft
                  : theme.colors.surfaceRaised,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <VadText
              variant="label"
              tone={active === 'Account' ? 'brand' : 'primary'}
            >
              {initial}
            </VadText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
