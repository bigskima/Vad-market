import { Image, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export type AuthMode = 'signIn' | 'signUp';

type Props = {
  onContinue(mode: AuthMode): void;
};

const welcomeVisual = require('../../../assets/images/vad-welcome-world.jpg');

export function WelcomeScreen({ onContinue }: Props) {
  const theme = useVadTheme();
  const { width, height } = useWindowDimensions();
  const wide = width >= 820;
  const compact = width < 390 || height < 720;

  function cycleTheme() {
    const next = theme.preference === 'system'
      ? 'light'
      : theme.preference === 'light'
        ? 'dark'
        : 'system';
    theme.setPreference(next);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          alignSelf: 'center',
          width: '100%',
          maxWidth: 1180,
          paddingHorizontal: compact ? theme.spacing.md : theme.spacing.xl,
          paddingTop: compact ? theme.spacing.md : theme.spacing.lg,
          paddingBottom: compact ? theme.spacing.lg : theme.spacing.xl,
          gap: compact ? theme.spacing.lg : theme.spacing.xl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <VadLogo size={compact ? 40 : 44} />
            <View style={{ gap: 1 }}>
              <VadText variant="heading">VAD</VadText>
              <VadText variant="caption" tone="secondary" style={{ letterSpacing: 1.2 }}>
                MARKET
              </VadText>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Theme ${theme.preference}. Change theme`}
            onPress={cycleTheme}
            style={({ pressed }) => ({
              minHeight: 40,
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.md,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
              opacity: pressed ? 0.78 : 1,
            })}
          >
            <VadText variant="caption" tone="secondary">
              {theme.preference === 'system' ? 'System' : theme.preference === 'light' ? 'Light' : 'Dark'}
            </VadText>
          </Pressable>
        </View>

        <View
          style={{
            flex: 1,
            minHeight: wide ? 610 : undefined,
            flexDirection: wide ? 'row' : 'column',
            alignItems: 'stretch',
            justifyContent: 'center',
            gap: wide ? theme.spacing.xxl : theme.spacing.lg,
          }}
        >
          <View
            style={{
              flex: wide ? 0.9 : undefined,
              justifyContent: 'center',
              gap: compact ? theme.spacing.md : theme.spacing.lg,
            }}
          >
            <View style={{ gap: theme.spacing.sm }}>
              <VadText variant="caption" tone="brand" style={{ letterSpacing: 1.5 }}>
                REAL PEOPLE. REAL PREDICTIONS.
              </VadText>
              <VadText variant={compact ? 'title' : 'display'}>
                A more informed world together.
              </VadText>
              <VadText tone="secondary" style={{ maxWidth: 560 }}>
                Explore real-world outcome markets, understand what the market believes, and back your own conviction when your view is different.
              </VadText>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              <FeaturePoint symbol="↗" label="Real outcomes" />
              <FeaturePoint symbol="◎" label="Market probabilities" />
              <FeaturePoint symbol="✓" label="Published rules" />
            </View>

            {wide ? <WelcomeActions onContinue={onContinue} /> : null}
          </View>

          <WelcomeHero compact={compact} wide={wide} />
        </View>

        {!wide ? <WelcomeActions onContinue={onContinue} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function WelcomeHero({ compact, wide }: { compact: boolean; wide: boolean }) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        flex: wide ? 1.1 : undefined,
        minHeight: wide ? 560 : compact ? 340 : 410,
        borderRadius: theme.radius.xl,
        borderWidth: 1,
        borderColor: theme.colors.borderStrong,
        backgroundColor: '#050813',
        overflow: 'hidden',
        justifyContent: 'space-between',
        ...theme.shadows.card,
      }}
    >
      <Image
        source={welcomeVisual}
        resizeMode="cover"
        style={{ position: 'absolute', width: '100%', height: '100%' }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(3, 7, 18, 0.28)',
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          left: 0,
          height: '48%',
          backgroundColor: 'rgba(3, 7, 18, 0.5)',
        }}
      />

      <View style={{ padding: compact ? theme.spacing.md : theme.spacing.lg, gap: 7 }}>
        <View
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: theme.radius.pill,
            backgroundColor: 'rgba(91, 91, 247, 0.9)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.16)',
          }}
        >
          <VadText variant="caption" tone="inverse" style={{ letterSpacing: 1.1 }}>
            PREDICT • TRADE • BELONG
          </VadText>
        </View>
        <VadText variant={compact ? 'heading' : 'title'} tone="inverse" style={{ maxWidth: 420 }}>
          See the world through probability.
        </VadText>
        <VadText variant="caption" tone="inverse" style={{ maxWidth: 430, opacity: 0.82 }}>
          Markets turn uncertainty into a clear signal you can understand and act on.
        </VadText>
      </View>

      <View style={{ padding: compact ? theme.spacing.md : theme.spacing.lg, gap: theme.spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            gap: 7,
            padding: 8,
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.18)',
            backgroundColor: 'rgba(8, 10, 18, 0.78)',
          }}
        >
          <HeroPoint symbol="↗" label="Real markets" />
          <HeroPoint symbol="◎" label="Global view" />
          <HeroPoint symbol="✓" label="Clear rules" />
        </View>
        <VadText variant="caption" tone="inverse" style={{ textAlign: 'center', opacity: 0.7 }}>
          Ideas today. A brighter tomorrow.
        </VadText>
      </View>
    </View>
  );
}

function WelcomeActions({ onContinue }: Props) {
  const theme = useVadTheme();
  return (
    <View style={{ maxWidth: 440, gap: theme.spacing.sm, paddingTop: theme.spacing.xs }}>
      <VadButton label="Create account" size="large" onPress={() => onContinue('signUp')} />
      <VadButton label="Sign in" size="large" variant="secondary" onPress={() => onContinue('signIn')} />
      <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
        Some features may require identity verification and may not be available in every location.
      </VadText>
    </View>
  );
}

function FeaturePoint({ symbol, label }: { symbol: string; label: string }) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        minHeight: 42,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.brandSoft,
        }}
      >
        <VadText variant="caption" tone="brand">{symbol}</VadText>
      </View>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}

function HeroPoint({ symbol, label }: { symbol: string; label: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7 }}>
      <VadText variant="heading" tone="brand">{symbol}</VadText>
      <VadText variant="caption" tone="inverse" numberOfLines={1} style={{ textAlign: 'center' }}>
        {label}
      </VadText>
    </View>
  );
}
