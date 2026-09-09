import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadText } from '@/components/ui/vad-text';
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
}[] = [
  { value: 'Home', label: 'Home' },
  { value: 'Markets', label: 'Markets' },
  { value: 'Wallet', label: 'Wallet' },
  { value: 'Portfolio', label: 'Portfolio' },
  { value: 'Account', label: 'Account' },
];

export function ProductTabBar({
  active,
  onChange,
}: {
  active: ProductTab;
  onChange: (tab: ProductTab) => void;
}) {
  const theme = useVadTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        paddingBottom: Math.max(insets.bottom, theme.spacing.xs),
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
          paddingHorizontal: theme.spacing.xs,
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
                minHeight: 58,
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.spacing.xs,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View
                style={{
                  width: selected ? 22 : 0,
                  height: 3,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.brandPrimary,
                }}
              />

              <VadText
                variant={selected ? 'label' : 'caption'}
                tone={selected ? 'brand' : 'tertiary'}
                numberOfLines={1}
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
