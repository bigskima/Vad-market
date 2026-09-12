import { Image, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export type AuthMode = 'signIn' | 'signUp';

type Props = { onContinue(mode: AuthMode): void };

const welcomeVisual = require('../../../assets/images/logo-glow.png');

export function WelcomeScreen({ onContinue }: Props) {
  const theme = useVadTheme();
  const { width, height } = useWindowDimensions();
  const wide = width >= 820;
  const compact = width < 390 || height < 720;

  function cycleTheme() {
    const next = theme.preference === 'system' ? 'light' : theme.preference === 'light' ? 'dark' : 'system';
    theme.setPreference(next);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, alignSelf: 'center', width: '100%', maxWidth: 1180, paddingHorizontal: compact ? theme.spacing.md : theme.spacing.xl, paddingTop: compact ? theme.spacing.md : theme.spacing.lg, paddingBottom: compact ? theme.spacing.lg : theme.spacing.xl, gap: compact ? theme.spacing.lg : theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <VadLogo size={compact ? 38 : 42} />
            <View style={{ gap: 1 }}><VadText variant="heading">VAD</VadText><VadText variant="caption" tone="secondary">MARKET</VadText></View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Theme ${theme.preference}. Change theme`} onPress={cycleTheme} style={({ pressed }) => ({ minHeight: 40, justifyContent: 'center', paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface, opacity: pressed ? 0.78 : 1 })}>
            <VadText variant="caption" tone="secondary">{theme.preference === 'system' ? 'System' : theme.preference === 'light' ? 'Light' : 'Dark'}</VadText>
          </Pressable>
        </View>

        <View style={{ flex: 1, minHeight: wide ? 590 : undefined, flexDirection: wide ? 'row' : 'column', alignItems: 'stretch', justifyContent: 'center', gap: wide ? theme.spacing.xxl : theme.spacing.lg }}>
          <View style={{ flex: wide ? 1.02 : undefined, justifyContent: 'center', gap: compact ? theme.spacing.md : theme.spacing.lg }}>
            <VadText variant="caption" tone="brand" style={{ letterSpacing: 1.4 }}>REAL PEOPLE. REAL PREDICTIONS.</VadText>
            <View style={{ gap: theme.spacing.sm }}>
              <VadText variant={compact ? 'title' : 'display'}>Predict what happens next.</VadText>
              <VadText tone="secondary" style={{ maxWidth: 570 }}>Trade your conviction on real-world outcomes. Market prices reflect the collective probability of what people think will happen.</VadText>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              <FeaturePoint symbol="↗" label="Trade on outcomes" /><FeaturePoint symbol="◎" label="A global community" /><FeaturePoint symbol="✓" label="Transparent & fair" />
            </View>
            {wide ? <WelcomeActions onContinue={onContinue} /> : null}
          </View>

          <View style={{ flex: wide ? 0.98 : undefined, minHeight: compact ? 315 : 390, borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden', justifyContent: 'flex-end' }}>
            <Image source={welcomeVisual} resizeMode="cover" style={{ position: 'absolute', width: '100%', height: '100%', opacity: theme.mode === 'dark' ? 0.72 : 0.34 }} />
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.colors.background, opacity: theme.mode === 'dark' ? 0.2 : 0.42 }} />
            <View style={{ padding: compact ? theme.spacing.md : theme.spacing.lg, gap: theme.spacing.sm }}>
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandPrimary }}><VadText variant="caption" tone="inverse">MARKET PREVIEW</VadText></View>
              <View style={{ borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, padding: compact ? theme.spacing.md : theme.spacing.lg, gap: theme.spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}>
                  <View style={{ flex: 1, gap: 4 }}><VadText variant="caption" tone="brand">ILLUSTRATIVE MARKET</VadText><VadText variant={compact ? 'bodyStrong' : 'heading'}>Will this outcome resolve YES?</VadText></View>
                  <VadText variant={compact ? 'heading' : 'title'} tone="yes">68%</VadText>
                </View>
                <View style={{ height: 7, flexDirection: 'row', overflow: 'hidden', borderRadius: theme.radius.pill }}><View style={{ width: '68%', backgroundColor: theme.colors.yes }} /><View style={{ flex: 1, backgroundColor: theme.colors.no }} /></View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><VadText variant="caption" tone="yes">YES 68%</VadText><VadText variant="caption" tone="no">NO 32%</VadText></View>
              </View>
            </View>
          </View>
        </View>
        {!wide ? <WelcomeActions onContinue={onContinue} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function WelcomeActions({ onContinue }: Props) {
  const theme = useVadTheme();
  return <View style={{ maxWidth: 440, gap: theme.spacing.sm, paddingTop: theme.spacing.xs }}><VadButton label="Create account" size="large" onPress={() => onContinue('signUp')} /><VadButton label="Sign in" size="large" variant="secondary" onPress={() => onContinue('signIn')} /><VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>Some features may require identity verification and may not be available in every location.</VadText></View>;
}

function FeaturePoint({ symbol, label }: { symbol: string; label: string }) {
  const theme = useVadTheme();
  return <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: theme.spacing.sm, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}><View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft }}><VadText variant="caption" tone="brand">{symbol}</VadText></View><VadText variant="caption" tone="secondary">{label}</VadText></View>;
}
