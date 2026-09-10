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
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingBottom: Math.max(insets.bottom, 4),
        paddingTop: 4,
      }}
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
                minHeight: density.compact ? 48 : 52,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                opacity: pressed ? 0.68 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <View
                style={{
                  minWidth: density.compact ? 38 : 42,
                  height: density.compact ? 26 : 28,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.colors.brandSoft : 'transparent',
                }}
              >
                <VadIcon name={tab.icon} size={density.compact ? 17 : 18} tone={selected ? 'brand' : 'tertiary'} />
              </View>

              <VadText
                variant="caption"
                tone={selected ? 'brand' : 'tertiary'}
                numberOfLines={1}
                style={{ fontWeight: selected ? '700' : '500', fontSize: density.compact ? 11 : 12 }}
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
