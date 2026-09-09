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
  glyph: string;
  label: string;
}[] = [
  { value: 'Home', glyph: '⌂', label: 'Home' },
  { value: 'Markets', glyph: '◎', label: 'Markets' },
  { value: 'Wallet', glyph: '₦', label: 'Wallet' },
  { value: 'Portfolio', glyph: '◒', label: 'Portfolio' },
  { value: 'Account', glyph: '●', label: 'Account' },
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
          paddingTop: theme.spacing.xs,
        }}
      >
        {PRODUCT_TABS.map((tab) => {
          const selected = tab.value === active;

          return (
            <Pressable
              key={tab.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(tab.value)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 56,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View
                style={{
                  width: 34,
                  height: 26,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderBottomWidth: 2,
                  borderBottomColor: selected
                    ? theme.colors.brandPrimary
                    : 'transparent',
                }}
              >
                <VadText
                  variant={tab.value === 'Wallet' ? 'label' : 'bodyStrong'}
                  tone={selected ? 'brand' : 'tertiary'}
                >
                  {tab.glyph}
                </VadText>
              </View>

              <VadText
                variant="caption"
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
