import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useVadTheme } from '@/providers/theme-provider';
import type { VadThemePreference } from '@/theme/tokens';

const options: { value: VadThemePreference; title: string; subtitle: string; glyph: string }[] = [
  { value: 'system', title: 'System', subtitle: 'Match your device setting automatically.', glyph: '◐' },
  { value: 'light', title: 'Light', subtitle: 'Use the light theme all the time.', glyph: '☀' },
  { value: 'dark', title: 'Dark', subtitle: 'Use the dark theme all the time.', glyph: '☾' },
];

export default function AppearanceScreen() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 820;

  return (
    <ProductSubpage title="Appearance" maxWidth={1040}>
      <View style={{ gap: density.sectionGap }}>
        <VadCard variant="brand" style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <VadText variant="caption" tone="brand">APPEARANCE</VadText>
              <VadText variant="heading">Choose how VAD looks</VadText>
              <VadText variant="caption" tone="secondary">Use your device setting, or keep VAD in Light or Dark mode.</VadText>
            </View>
            <VadChip label={theme.mode === 'dark' ? 'Dark' : 'Light'} tone="brand" />
          </View>
        </VadCard>

        <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'flex-start', gap: theme.spacing.md }}>
          <VadCard style={{ flex: 1, width: '100%', gap: theme.spacing.sm }}>
            <VadText variant="bodyStrong">Theme</VadText>
            <View accessibilityRole="radiogroup" style={{ gap: theme.spacing.xs }}>
              {options.map((option) => {
                const selected = theme.preference === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.title}
                    accessibilityHint={option.subtitle}
                    onPress={() => theme.setPreference(option.value)}
                    style={({ pressed }) => ({
                      minHeight: density.compact ? 52 : 58,
                      borderRadius: theme.radius.md,
                      backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                      paddingHorizontal: theme.spacing.sm,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                      opacity: pressed ? 0.68 : 1,
                    })}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}>
                      <VadText variant="bodyStrong" tone={selected ? 'brand' : 'secondary'}>{option.glyph}</VadText>
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                      <VadText variant="bodyStrong" tone={selected ? 'brand' : 'primary'}>{option.title}</VadText>
                      <VadText variant="caption" tone="secondary" numberOfLines={1}>{option.subtitle}</VadText>
                    </View>
                    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: selected ? theme.colors.brandPrimary : theme.colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                      {selected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.brandPrimary }} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </VadCard>

          <VadCard variant="raised" style={{ width: wide ? 340 : '100%', gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
              <View style={{ flex: 1, gap: 1 }}>
                <VadText variant="bodyStrong">Preview</VadText>
                <VadText variant="caption" tone="secondary">See how VAD looks with your current choice.</VadText>
              </View>
              <VadChip label={theme.preference === 'system' ? 'System' : theme.mode === 'dark' ? 'Dark' : 'Light'} />
            </View>

            <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.surface }}>
              <View style={{ minHeight: 46, paddingHorizontal: theme.spacing.sm, backgroundColor: theme.colors.surfaceRaised, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.brandPrimary }} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ width: '44%', height: 7, borderRadius: theme.radius.pill, backgroundColor: theme.colors.textPrimary }} />
                  <View style={{ width: '68%', height: 5, borderRadius: theme.radius.pill, backgroundColor: theme.colors.borderStrong }} />
                </View>
              </View>

              <View style={{ padding: theme.spacing.sm, gap: theme.spacing.xs }}>
                <VadText variant="caption" tone="brand">PREVIEW</VadText>
                <VadText variant="bodyStrong">Clear and comfortable to read</VadText>
                <VadText variant="caption" tone="secondary">This preview changes instantly when you choose a different theme.</VadText>
                <View style={{ minHeight: 38, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandPrimary, alignItems: 'center', justifyContent: 'center' }}>
                  <VadText variant="label" tone="inverse">Primary action</VadText>
                </View>
                <View style={{ minHeight: 38, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                  <VadText variant="label">Secondary action</VadText>
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
              <Swatch label="Page" value={theme.colors.background} />
              <Swatch label="Cards" value={theme.colors.surface} />
              <Swatch label="Accent" value={theme.colors.brandPrimary} />
            </View>
          </VadCard>
        </View>
      </View>
    </ProductSubpage>
  );
}

function Swatch({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <View style={{ height: 22, borderRadius: theme.radius.md, backgroundColor: value, borderWidth: 1, borderColor: theme.colors.border }} />
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
    </View>
  );
}
