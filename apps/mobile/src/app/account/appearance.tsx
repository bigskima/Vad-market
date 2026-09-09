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

  return (
    <ProductSubpage title="Appearance" maxWidth={980}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">APPEARANCE</VadText>
        <VadText variant="title">Choose how VAD feels on this device.</VadText>
        <VadText tone="secondary">
          System follows your device automatically. Light and Dark remain fixed
          until you change them.
        </VadText>
      </View>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: wide ? theme.spacing.xxxl : theme.spacing.xl,
        }}
      >
        <View style={{ flex: 1, width: '100%' }}>
          <View
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
                  onPress={() => theme.setPreference(option.value)}
                  style={({ pressed }) => ({
                    minHeight: 82,
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
                      width: 40,
                      height: 40,
                      alignItems: 'center',
                      justifyContent: 'center',
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
            width: wide ? 340 : '100%',
            gap: theme.spacing.lg,
          }}
        >
          <View style={{ gap: 2 }}>
            <VadText variant="caption" tone="tertiary">LIVE PREVIEW</VadText>
            <VadText variant="heading">
              {theme.mode === 'dark' ? 'Dark' : 'Light'} mode
            </VadText>
            <VadText variant="caption" tone="secondary">
              {theme.preference === 'system'
                ? 'System is selected and currently resolves to ' + theme.mode + '.'
                : 'This appearance will stay selected on this device.'}
            </VadText>
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: theme.colors.border,
              paddingVertical: theme.spacing.md,
              gap: theme.spacing.md,
            }}
          >
            <VadText variant="caption" tone="brand">MARKET PREVIEW</VadText>
            <VadText variant="bodyStrong">
              Will the market resolve YES?
            </VadText>

            <View
              style={{
                height: 7,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.surfaceMuted,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: '64%',
                  height: '100%',
                  backgroundColor: theme.colors.yes,
                }}
              />
            </View>

            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.xl,
              }}
            >
              <PreviewOutcome label="YES" value="64%" positive />
              <PreviewOutcome label="NO" value="36%" positive={false} />
            </View>
          </View>

          <View
            style={{
              minHeight: 46,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.brandPrimary,
            }}
          >
            <VadText variant="label" tone="inverse">Primary action</VadText>
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

function PreviewOutcome({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <VadText variant="caption" tone={positive ? 'yes' : 'no'}>
        {label}
      </VadText>
      <VadText variant="heading" tone={positive ? 'yes' : 'no'}>
        {value}
      </VadText>
    </View>
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
