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
      pointerEvents="box-none"
      style={{
        backgroundColor: theme.colors.background,
        paddingHorizontal: 10,
        paddingTop: 7,
        paddingBottom: Math.max(insets.bottom, 7),
      }}
    >
      <View
        accessibilityRole="tablist"
        style={[
          theme.shadows.floating,
          {
            width: '100%',
            maxWidth: 620,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'stretch',
            paddingHorizontal: 5,
            paddingVertical: 4,
            borderRadius: theme.radius.xxl,
            borderWidth: 1,
            borderColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surface,
          },
        ]}
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
                minHeight: density.compact ? 50 : 54,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                borderRadius: theme.radius.xl,
                backgroundColor: selected ? theme.colors.brandSoft : pressed ? theme.colors.surfaceRaised : 'transparent',
                opacity: pressed ? 0.78 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <View
                style={{
                  minWidth: density.compact ? 34 : 38,
                  height: density.compact ? 28 : 30,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.colors.brandPrimary : 'transparent',
                }}
              >
                <VadIcon name={tab.icon} size={density.compact ? 17 : 18} tone={selected ? 'inverse' : 'tertiary'} />
              </View>

              <VadText
                variant="caption"
                tone={selected ? 'brand' : 'tertiary'}
                numberOfLines={1}
                style={{ fontWeight: selected ? '800' : '500', fontSize: density.compact ? 10 : 11 }}
              >
                {tab.label}
              </VadText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
