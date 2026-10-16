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
          maxWidth: 1240,
          paddingHorizontal: compact ? theme.spacing.md : theme.spacing.xl,
          paddingTop: compact ? theme.spacing.md : theme.spacing.lg,
          paddingBottom: compact ? theme.spacing.lg : theme.spacing.xl,
          gap: compact ? theme.spacing.md : theme.spacing.lg,
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
              <VadText variant={compact ? 'title' : 'display'}>
                See what the world thinks.
              </VadText>
              <VadText tone="secondary" style={{ maxWidth: 560 }}>
                Clear odds. Real-world outcomes.
              </VadText>
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
        minHeight: wide ? 440 : compact ? 220 : 280,
        borderRadius: theme.radius.xxl,
        borderWidth: 1,
        borderColor: theme.colors.borderStrong,
        backgroundColor: '#050813',
        overflow: 'hidden',
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
          backgroundColor: 'rgba(3, 7, 18, 0.18)',
        }}
      />
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

