import {
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export type AuthMode = 'signIn' | 'signUp';

type Props = {
  onContinue(mode: AuthMode): void;
};

export function WelcomeScreen({ onContinue }: Props) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const compact = width < 380;

  function cycleTheme() {
    const next = theme.preference === 'system' ? 'light' : theme.preference === 'light' ? 'dark' : 'system';
    theme.setPreference(next);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          alignSelf: 'center',
          width: '100%',
          maxWidth: 1160,
          paddingHorizontal: compact ? theme.spacing.md : theme.spacing.xl,
          paddingVertical: theme.spacing.xl,
          gap: theme.spacing.xxxl,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <VadLogo size={44} />
            <View>
              <VadText variant="heading">VAD</VadText>
              <VadText variant="caption" tone="secondary">Value Asset Depot</VadText>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <View
              accessibilityLabel="Language English"
              style={{
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              }}
            >
              <VadText variant="caption" tone="secondary">English</VadText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Theme ${theme.preference}. Change theme`}
              onPress={cycleTheme}
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
              })}
            >
              <VadText variant="caption" tone="secondary">{theme.preference === 'system' ? 'System' : theme.preference === 'light' ? 'Light' : 'Dark'}</VadText>
            </Pressable>
          </View>
        </View>

        <View
          style={{
            flex: 1,
            flexDirection: wide ? 'row' : 'column',
            alignItems: wide ? 'center' : 'stretch',
            justifyContent: 'center',
            gap: wide ? theme.spacing.huge : theme.spacing.xxl,
          }}
        >
          <View style={{ flex: wide ? 1.05 : undefined, gap: theme.spacing.xl }}>
            <View style={{ gap: theme.spacing.md }}>
              <View style={{ alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandSoft, borderWidth: 1, borderColor: theme.colors.brandPrimary }}>
                <VadText variant="caption" tone="brand">CONVICTION MARKETS, MADE CLEAR</VadText>
              </View>
              <VadText variant="display">Price the outcome. Back your conviction.</VadText>
              <VadText tone="secondary" style={{ maxWidth: 560 }}>
                Explore live probabilities, understand how each market is decided and take a position when your research sees something the crowd does not.
              </VadText>
            </View>

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
              <TrustPoint value="Live" label="Market prices" />
              <TrustPoint value="Clear" label="Market rules" />
              <TrustPoint value="Public" label="Track records" />
            </View>

            {wide ? (
              <View style={{ maxWidth: 440, gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                <VadButton label="Create account" size="large" onPress={() => onContinue('signUp')} />
                <VadButton label="Sign in" size="large" variant="secondary" onPress={() => onContinue('signIn')} />
              </View>
            ) : null}
          </View>

          <VadCard
            variant="floating"
            style={{
              flex: wide ? 0.95 : undefined,
              padding: wide ? theme.spacing.xxl : theme.spacing.xl,
              gap: theme.spacing.xl,
              borderColor: theme.colors.brandPrimary,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md, alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: theme.spacing.xs }}>
                <VadText variant="caption" tone="brand">MARKET PREVIEW</VadText>
                <VadText variant="heading">Will the event resolve YES?</VadText>
                <VadText variant="caption" tone="secondary">Example market probability</VadText>
              </View>
              <View style={{ minWidth: 82, alignItems: 'flex-end' }}>
                <VadText variant="display" tone="brand">64%</VadText>
              </View>
            </View>

            <View style={{ height: 10, borderRadius: theme.radius.pill, overflow: 'hidden', backgroundColor: theme.colors.noSoft }}>
              <View style={{ width: '64%', height: '100%', backgroundColor: theme.colors.yes }} />
            </View>

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <SignalFact label="YES" value="64%" tone="yes" />
              <SignalFact label="NO" value="36%" tone="no" />
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md }}>
              <VadText variant="caption" tone="secondary">
                Market prices show participant conviction. The final result follows the published rules for that market.
              </VadText>
            </View>
          </VadCard>
        </View>

        {!wide ? (
          <View style={{ gap: theme.spacing.sm }}>
            <VadButton label="Create account" size="large" onPress={() => onContinue('signUp')} />
            <VadButton label="I already have an account" size="large" variant="secondary" onPress={() => onContinue('signIn')} />
          </View>
        ) : null}

        <VadText variant="caption" tone="tertiary" style={{ textAlign: wide ? 'left' : 'center' }}>
          Market access and money movement can depend on your location, identity verification and account eligibility. English is the current launch language.
        </VadText>
      </ScrollView>
    </SafeAreaView>
  );
}

function TrustPoint({ value, label }: { value: string; label: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minWidth: 118, minHeight: 64, justifyContent: 'center', gap: 2, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
      <VadText variant="bodyStrong">{value}</VadText>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
    </View>
  );
}

function SignalFact({ label, value, tone }: { label: string; value: string; tone: 'yes' | 'no' }) {
  const theme = useVadTheme();
  return (
    <View style={{ flex: 1, minWidth: 110, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 2, backgroundColor: tone === 'yes' ? theme.colors.yesSoft : theme.colors.noSoft }}>
      <VadText variant="caption" tone={tone}>{label}</VadText>
      <VadText variant="heading" tone={tone}>{value}</VadText>
    </View>
  );
}
