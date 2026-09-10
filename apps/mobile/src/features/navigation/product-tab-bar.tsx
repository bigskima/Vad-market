import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
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
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingBottom: Math.max(insets.bottom, theme.spacing.xs),
        paddingTop: theme.spacing.xs,
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
                opacity: pressed ? 0.68 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <View
                style={{
                  minWidth: 48,
                  height: 32,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.colors.brandSoft : 'transparent',
                }}
              >
                <VadIcon name={tab.icon} size={20} tone={selected ? 'brand' : 'tertiary'} />
              </View>

              <VadText
                variant="caption"
                tone={selected ? 'brand' : 'tertiary'}
                numberOfLines={1}
                style={{ fontWeight: selected ? '700' : '500' }}
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
