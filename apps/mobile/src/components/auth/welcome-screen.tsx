import { useEffect, useState } from 'react';
import { Animated, Pressable, useWindowDimensions, View } from 'react-native';
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
  const [cinematicMotion] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(cinematicMotion, { toValue: 1, duration: 14000, useNativeDriver: true }),
        Animated.timing(cinematicMotion, { toValue: 0, duration: 14000, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [cinematicMotion]);

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
      <View style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.colors.welcomeBase }}>
        <Animated.Image
          source={welcomeVisual}
          accessibilityLabel="A view of the world from space"
          resizeMode="cover"
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            opacity: theme.mode === 'dark' ? 0.94 : 0.84,
            transform: [
              { scale: cinematicMotion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
              { translateX: cinematicMotion.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
            ],
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: theme.colors.overlay,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: theme.colors.brandSoft,
            opacity: theme.mode === 'dark' ? 0.22 : 0.14,
          }}
        />

        <View
          style={{
            flex: 1,
            width: '100%',
            maxWidth: 1240,
            alignSelf: 'center',
            paddingHorizontal: compact ? theme.spacing.md : theme.spacing.xl,
            paddingTop: compact ? theme.spacing.sm : theme.spacing.lg,
            paddingBottom: compact ? theme.spacing.md : theme.spacing.xl,
            justifyContent: 'space-between',
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
              <VadLogo size={compact ? 36 : 42} />
              <View style={{ gap: 0 }}>
                <VadText variant="heading" tone="inverse">VAD</VadText>
                <VadText variant="caption" tone="inverse" style={{ letterSpacing: 1.4, opacity: 0.78 }}>
                  MARKET
                </VadText>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Theme set to ${theme.preference}. Change theme`}
              onPress={cycleTheme}
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.welcomeControlBorder,
                backgroundColor: theme.colors.welcomeControlSurface,
                opacity: pressed ? 0.78 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <VadText variant="caption" tone="inverse">
                {theme.preference === 'system' ? 'System theme' : theme.preference === 'light' ? 'Light theme' : 'Dark theme'}
              </VadText>
            </Pressable>
          </View>

          <View
            style={{
              width: '100%',
              maxWidth: wide ? 540 : 460,
              alignSelf: wide ? 'flex-start' : 'stretch',
              gap: compact ? theme.spacing.md : theme.spacing.lg,
              paddingBottom: compact ? theme.spacing.xs : theme.spacing.md,
            }}
          >
            <View style={{ gap: theme.spacing.sm }}>
              <VadText variant="caption" tone="inverse" style={{ letterSpacing: 1.8, opacity: 0.82 }}>
                SEE THE SIGNAL. MAKE YOUR CALL.
              </VadText>
              <VadText variant={compact ? 'title' : 'display'} tone="inverse" style={{ maxWidth: 500 }}>
                See what the world thinks.
              </VadText>
              <VadText tone="inverse" style={{ maxWidth: 390, opacity: 0.82 }}>
                Clear odds. Real-world outcomes.
              </VadText>
            </View>

            <View style={{ width: '100%', maxWidth: 420, gap: theme.spacing.sm }}>
              <VadButton
                label="Create account"
                size="large"
                onPress={() => onContinue('signUp')}
              />
              <VadButton
                label="Sign in"
                size="large"
                variant="secondary"
                onPress={() => onContinue('signIn')}
              />
              <VadText
                variant="caption"
                tone="inverse"
                style={{ textAlign: 'center', opacity: 0.72, paddingTop: theme.spacing.xs }}
              >
                Some features may require identity verification and may not be available in every location.
              </VadText>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
