import { Pressable, View } from 'react-native';

import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';

type HeaderAction = {
  icon: VadIconName;
  label: string;
  onPress: () => void;
  badge?: boolean;
};

/** Compact screen-scoped header. Each page supplies only the title, subtitle and actions it needs. */
export function PageHeader({ title, subtitle, actions = [] }: { title: string; subtitle?: string; actions?: HeaderAction[] }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: density.compact ? 2 : 6, paddingBottom: 4 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <VadText variant="title" style={{ fontSize: density.compact ? 27 : 31, lineHeight: density.compact ? 32 : 36, letterSpacing: -0.7 }}>{title}</VadText>
        {subtitle ? <VadText variant="body" tone="secondary" style={{ fontSize: density.compact ? 13 : 15, lineHeight: density.compact ? 18 : 21 }}>{subtitle}</VadText> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2 }}>
        {actions.map((action) => (
          <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 })}>
            <VadIcon name={action.icon} size={18} tone="secondary" />
            {action.badge ? <View style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.no }} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
