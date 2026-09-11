import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';

export type ProductTab =
  | 'Home'
  | 'Markets'
  | 'Wallet'
  | 'Portfolio'
  | 'Account';

export const PRODUCT_TABS: {
  value: ProductTab;
  label: string;
  icon: VadIconName;
}[] = [
  { value: 'Home', label: 'Home', icon: 'home' },
  { value: 'Markets', label: 'Markets', icon: 'markets' },
  { value: 'Wallet', label: 'Wallet', icon: 'wallet' },
  { value: 'Portfolio', label: 'Portfolio', icon: 'portfolio' },
  { value: 'Account', label: 'Account', icon: 'account' },
];

export function ProductTabBar({
  active,
  onChange,
}: {
  active: ProductTab;
  onChange: (tab: ProductTab) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        theme.shadows.floating,
        {
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          paddingBottom: Math.max(insets.bottom, 5),
          paddingTop: 4,
        },
      ]}
    >
      <View
        accessibilityRole="tablist"
        style={{
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'stretch',
          paddingHorizontal: 4,
        }}
      >
        {PRODUCT_TABS.map((tab) => {
          const selected = tab.value === active;

          return (
            <Pressable
              key={tab.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
              onPress={() => onChange(tab.value)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: density.compact ? 54 : 58,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                opacity: pressed ? 0.7 : 1,
                transform: [{ translateY: selected ? -1 : 0 }, { scale: pressed ? 0.96 : 1 }],
              })}
            >
              <View
                style={{
                  minWidth: density.compact ? 40 : 44,
                  height: 30,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.colors.brandSoft : 'transparent',
                  borderWidth: selected ? 1 : 0,
                  borderColor: selected ? theme.colors.brandPrimary : 'transparent',
                }}
              >
                <VadIcon name={tab.icon} size={density.compact ? 18 : 19} tone={selected ? 'brand' : 'tertiary'} />
              </View>

              <VadText
                variant="caption"
                tone={selected ? 'brand' : 'tertiary'}
                numberOfLines={1}
                style={{ fontWeight: selected ? '800' : '500', fontSize: density.compact ? 10 : 11 }}
              >
                {tab.label}
              </VadText>

              {selected ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    bottom: 1,
                    width: 18,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor: theme.colors.brandPrimary,
                  }}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
