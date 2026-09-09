import { Pressable, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useVadTheme } from '@/providers/theme-provider';
import type { VadThemePreference } from '@/theme/tokens';

const options: {
  value: VadThemePreference;
  title: string;
  subtitle: string;
  glyph: string;
}[] = [
  {
    value: 'system',
    title: 'System',
    subtitle: 'Follow your phone or browser appearance automatically.',
    glyph: '◐',
  },
  {
    value: 'light',
    title: 'Light',
    subtitle: 'Use VAD with bright surfaces and dark text.',
    glyph: '☀',
  },
  {
    value: 'dark',
    title: 'Dark',
    subtitle: 'Use VAD with low-light surfaces and bright text.',
    glyph: '☾',
  },
];

export default function AppearanceScreen() {
  const theme = useVadTheme();

  return (
    <ProductSubpage title="Appearance">
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="title">Choose how VAD looks.</VadText>
        <VadText tone="secondary">
          Your preference is saved on this device. System mode follows your device automatically.
        </VadText>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        {options.map((option) => {
          const selected = theme.preference === option.value;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => theme.setPreference(option.value)}
              style={({ pressed }) => ({
                minHeight: 86,
                borderRadius: theme.radius.xl,
                borderWidth: 1,
                borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                padding: theme.spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.colors.surface : theme.colors.surfaceRaised,
                }}
              >
                <VadText variant="heading" tone={selected ? 'brand' : 'secondary'}>
                  {option.glyph}
                </VadText>
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <VadText variant="bodyStrong">{option.title}</VadText>
                <VadText variant="caption" tone="secondary">{option.subtitle}</VadText>
              </View>

              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: selected ? theme.colors.brandPrimary : theme.colors.borderStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selected ? (
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: theme.colors.brandPrimary,
                    }}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View
        style={{
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.surfaceRaised,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
        }}
      >
        <VadText variant="caption" tone="tertiary">CURRENT APPEARANCE</VadText>
        <VadText variant="heading">
          {theme.mode === 'dark' ? 'Dark' : 'Light'}
        </VadText>
        <VadText variant="caption" tone="secondary">
          {theme.preference === 'system'
            ? 'System mode is active and currently resolves to ' + theme.mode + '.'
            : 'VAD will keep this appearance until you change it.'}
        </VadText>
      </View>
    </ProductSubpage>
  );
}
