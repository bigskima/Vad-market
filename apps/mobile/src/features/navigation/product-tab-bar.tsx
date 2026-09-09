import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export type ProductTab = 'Home' | 'Markets' | 'Wallet' | 'Portfolio' | 'Account';

const tabs: { value: ProductTab; glyph: string; label: string }[] = [
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
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.xs,
        paddingTop: theme.spacing.xs,
        paddingBottom: Math.max(insets.bottom, theme.spacing.xs),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        {tabs.map((tab) => {
          const selected = tab.value === active;

          return (
            <Pressable
              key={tab.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(tab.value)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 54,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <View
                style={{
                  minWidth: 34,
                  height: 26,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: theme.spacing.xs,
                  backgroundColor: selected ? theme.colors.brandSoft : 'transparent',
                }}
              >
                <VadText
                  variant={tab.value === 'Wallet' ? 'label' : 'bodyStrong'}
                  tone={selected ? 'brand' : 'tertiary'}
                >
                  {tab.glyph}
                </VadText>
              </View>
              <VadText variant="caption" tone={selected ? 'brand' : 'tertiary'}>
                {tab.label}
              </VadText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
