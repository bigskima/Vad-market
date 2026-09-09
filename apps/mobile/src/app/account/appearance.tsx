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
          System follows your device automatically. Light and Dark stay fixed
          until you change them.
        </VadText>
      </View>

      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: wide ? theme.spacing.xxl : theme.spacing.lg,
        }}
      >
        <View style={{ flex: 1, width: '100%', gap: theme.spacing.sm }}>
          {options.map((option) => {
            const selected = theme.preference === option.value;

            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => theme.setPreference(option.value)}
                style={({ pressed }) => ({
                  minHeight: 78,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  paddingVertical: theme.spacing.sm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
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
                  <VadText variant="bodyStrong">{option.title}</VadText>
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

        <View
          style={{
            width: wide ? 330 : '100%',
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              backgroundColor: theme.colors.surfaceRaised,
              padding: theme.spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <VadText variant="caption" tone="tertiary">LIVE PREVIEW</VadText>
          </View>

          <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
            <View style={{ gap: theme.spacing.xs }}>
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
                borderRadius: theme.radius.lg,
                backgroundColor: theme.colors.brandSoft,
                padding: theme.spacing.md,
                gap: theme.spacing.sm,
              }}
            >
              <VadText variant="caption" tone="brand">MARKET PREVIEW</VadText>
              <VadText variant="bodyStrong">
                Will the market resolve YES?
              </VadText>
              <View
                style={{
                  flexDirection: 'row',
                  gap: theme.spacing.sm,
                }}
              >
                <PreviewOutcome
                  label="YES"
                  value="64%"
                  positive
                />
                <PreviewOutcome
                  label="NO"
                  value="36%"
                  positive={false}
                />
              </View>
            </View>

            <View
              style={{
                minHeight: 42,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.brandPrimary,
              }}
            >
              <VadText variant="label" tone="inverse">Primary action</VadText>
            </View>
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
  const theme = useVadTheme();

  return (
    <View
      style={{
        flex: 1,
        borderRadius: theme.radius.md,
        backgroundColor: positive
          ? theme.colors.yesSoft
          : theme.colors.noSoft,
        padding: theme.spacing.sm,
      }}
    >
      <VadText variant="caption" tone={positive ? 'yes' : 'no'}>
        {label}
      </VadText>
      <VadText variant="heading" tone={positive ? 'yes' : 'no'}>
        {value}
      </VadText>
    </View>
  );
}
