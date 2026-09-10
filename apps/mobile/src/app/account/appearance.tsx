import {
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

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
    subtitle: 'Use bright surfaces with dark text.',
    glyph: '☀',
  },
  {
    value: 'dark',
    title: 'Dark',
    subtitle: 'Use low-light surfaces with bright text.',
    glyph: '☾',
  },
];

export default function AppearanceScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const compact = width < 380;

  return (
    <ProductSubpage title="Appearance" maxWidth={1040}>
      <View
        style={{
          flexDirection: width >= 680 ? 'row' : 'column',
          alignItems: width >= 680 ? 'flex-end' : 'stretch',
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">APPEARANCE</VadText>
          <VadText variant="title">Make VAD comfortable on this device.</VadText>
          <VadText tone="secondary">
            System follows your device automatically. Light and Dark remain
            fixed until you change them.
          </VadText>
        </View>

        <View style={{ gap: 2, alignItems: width >= 680 ? 'flex-end' : 'flex-start' }}>
          <VadText variant="caption" tone="secondary">ACTIVE THEME</VadText>
          <VadText variant="heading" tone="brand">
            {theme.mode === 'dark' ? 'Dark' : 'Light'}
          </VadText>
          <VadText variant="caption" tone="tertiary">
            {theme.preference === 'system' ? 'Following system' : 'Fixed preference'}
          </VadText>
        </View>
      </View>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: wide ? theme.spacing.xxxl : theme.spacing.xl,
        }}
      >
        <View style={{ flex: 1, width: '100%', gap: theme.spacing.sm }}>
          <View style={{ gap: 2 }}>
            <VadText variant="heading">Theme preference</VadText>
            <VadText variant="caption" tone="secondary">
              Saved locally so the choice applies consistently on this device.
            </VadText>
          </View>

          <View
            accessibilityRole="radiogroup"
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
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
                    minHeight: compact ? 76 : 82,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                    paddingVertical: theme.spacing.sm,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.md,
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: theme.radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected
                        ? theme.colors.brandSoft
                        : theme.colors.surfaceRaised,
                    }}
                  >
                    <VadText
                      variant="heading"
                      tone={selected ? 'brand' : 'secondary'}
                    >
                      {option.glyph}
                    </VadText>
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <VadText
                      variant="bodyStrong"
                      tone={selected ? 'brand' : 'primary'}
                    >
                      {option.title}
                    </VadText>
                    <VadText variant="caption" tone="secondary">
                      {option.subtitle}
                    </VadText>
                  </View>

                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 2,
                      borderColor: selected
                        ? theme.colors.brandPrimary
                        : theme.colors.borderStrong,
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
        </View>

        <View
          style={{
            width: wide ? 360 : '100%',
            gap: theme.spacing.lg,
          }}
        >
          <View style={{ gap: 2 }}>
            <VadText variant="caption" tone="tertiary">LIVE THEME PREVIEW</VadText>
            <VadText variant="heading">
              {theme.mode === 'dark' ? 'Dark surfaces' : 'Light surfaces'}
            </VadText>
            <VadText variant="caption" tone="secondary">
              This preview demonstrates hierarchy and contrast only. It does not
              display simulated market prices or account data.
            </VadText>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              overflow: 'hidden',
              backgroundColor: theme.colors.surface,
            }}
          >
            <View
              style={{
                minHeight: 62,
                padding: theme.spacing.md,
                backgroundColor: theme.colors.surfaceRaised,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: theme.colors.brandPrimary,
                }}
              />
              <View style={{ flex: 1, gap: theme.spacing.xs }}>
                <View
                  style={{
                    width: '48%',
                    height: 8,
                    borderRadius: theme.radius.pill,
                    backgroundColor: theme.colors.textPrimary,
                  }}
                />
                <View
                  style={{
                    width: '72%',
                    height: 6,
                    borderRadius: theme.radius.pill,
                    backgroundColor: theme.colors.borderStrong,
                  }}
                />
              </View>
            </View>

            <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
              <VadText variant="label" tone="brand">CONTENT HIERARCHY</VadText>
              <VadText variant="heading">Readable in every mode.</VadText>
              <VadText variant="caption" tone="secondary">
                Primary, secondary and interactive elements all use the active
                theme tokens rather than fixed light-mode values.
              </VadText>

              <View
                style={{
                  minHeight: 44,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.brandPrimary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <VadText variant="label" tone="inverse">Primary action</VadText>
              </View>

              <View
                style={{
                  minHeight: 44,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.colors.borderStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <VadText variant="label">Secondary action</VadText>
              </View>
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.sm,
              flexWrap: 'wrap',
            }}
          >
            <Swatch label="Background" value={theme.colors.background} />
            <Swatch label="Surface" value={theme.colors.surface} />
            <Swatch label="Brand" value={theme.colors.brandPrimary} />
          </View>
        </View>
      </View>
    </ProductSubpage>
  );
}

function Swatch({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();

  return (
    <View style={{ minWidth: 92, flex: 1, gap: theme.spacing.xs }}>
      <View
        style={{
          height: 28,
          borderRadius: theme.radius.md,
          backgroundColor: value,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      />
      <VadText variant="caption" tone="tertiary">{label}</VadText>
    </View>
  );
}
