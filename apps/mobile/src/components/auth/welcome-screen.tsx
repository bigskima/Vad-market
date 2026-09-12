import {
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export type AuthMode = 'signIn' | 'signUp';

type Props = {
  onContinue(mode: AuthMode): void;
};

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
            <VadLogo size={compact ? 38 : 42} />
            <View style={{ gap: 1 }}>
              <VadText variant="heading">VAD</VadText>
              <VadText variant="caption" tone="secondary">Value Asset Depot</VadText>
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
              {theme.preference === 'system' ? 'System theme' : theme.preference === 'light' ? 'Light theme' : 'Dark theme'}
            </VadText>
          </Pressable>
        </View>

        <View
          style={{
            flex: 1,
            minHeight: wide ? 560 : undefined,
            flexDirection: wide ? 'row' : 'column',
            alignItems: 'stretch',
            justifyContent: 'center',
            gap: wide ? theme.spacing.xxl : theme.spacing.lg,
          }}
        >
          <View
            style={{
              flex: wide ? 1.05 : undefined,
              justifyContent: 'center',
              gap: compact ? theme.spacing.md : theme.spacing.lg,
            }}
          >
            <View
              style={{
                alignSelf: 'flex-start',
                minHeight: 32,
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.brandSoft,
                borderWidth: 1,
                borderColor: theme.colors.brandPrimary,
              }}
            >
              <VadText variant="caption" tone="brand">PREDICTION MARKETS, MADE CLEAR</VadText>
            </View>

            <View style={{ gap: theme.spacing.sm }}>
              <VadText variant={compact ? 'title' : 'display'}>
                See what the market believes. Decide what you believe.
              </VadText>
              <VadText tone="secondary" style={{ maxWidth: 590 }}>
                Explore real-world outcome markets, understand the probability behind each price, and take a position when your view is different.
              </VadText>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              <PremiumPoint label="Clear probabilities" />
              <PremiumPoint label="Published market rules" />
              <PremiumPoint label="Track your positions" />
            </View>

            {wide ? (
              <View style={{ maxWidth: 430, gap: theme.spacing.sm, paddingTop: theme.spacing.sm }}>
                <VadButton label="Create account" size="large" onPress={() => onContinue('signUp')} />
                <VadButton label="Sign in" size="large" variant="secondary" onPress={() => onContinue('signIn')} />
                <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
                  Some features may require identity verification and may not be available in every location.
                </VadText>
              </View>
            ) : null}
          </View>

          <View
            style={{
              flex: wide ? 0.95 : undefined,
              justifyContent: 'center',
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              overflow: 'hidden',
              minHeight: compact ? 250 : 300,
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -72,
                right: -56,
                width: 190,
                height: 190,
                borderRadius: 95,
                backgroundColor: theme.colors.brandSoft,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                bottom: -90,
                left: -54,
                width: 180,
                height: 180,
                borderRadius: 90,
                backgroundColor: theme.colors.surfaceMuted,
              }}
            />

            <View style={{ padding: compact ? theme.spacing.lg : theme.spacing.xl, gap: compact ? theme.spacing.md : theme.spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <VadText variant="caption" tone="brand">LIVE MARKET EXAMPLE</VadText>
                  <VadText variant={compact ? 'heading' : 'title'}>Will this event resolve YES?</VadText>
                  <VadText variant="caption" tone="secondary">Market-implied probability</VadText>
                </View>
                <View
                  style={{
                    minWidth: compact ? 82 : 98,
                    minHeight: compact ? 82 : 98,
                    borderRadius: theme.radius.xl,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.brandPrimary,
                  }}
                >
                  <VadText variant={compact ? 'title' : 'display'} tone="inverse">64%</VadText>
                </View>
              </View>

              <View style={{ height: 8, borderRadius: theme.radius.pill, overflow: 'hidden', backgroundColor: theme.colors.noSoft }}>
                <View style={{ width: '64%', height: '100%', backgroundColor: theme.colors.yes }} />
              </View>

              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <OutcomePill label="YES" value="64%" tone="yes" />
                <OutcomePill label="NO" value="36%" tone="no" />
              </View>

              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                  paddingTop: theme.spacing.md,
                  gap: 3,
                }}
              >
                <VadText variant="caption" tone="secondary">
                  Prices can move as participants trade. Final outcomes follow the published resolution rules for each market.
                </VadText>
              </View>
            </View>
          </View>
        </View>

        {!wide ? (
          <View style={{ gap: theme.spacing.sm }}>
            <VadButton label="Create account" size="large" onPress={() => onContinue('signUp')} />
            <VadButton label="I already have an account" size="large" variant="secondary" onPress={() => onContinue('signIn')} />
            <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
              Some features may require identity verification and may not be available in every location.
            </VadText>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PremiumPoint({ label }: { label: string }) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        minHeight: 38,
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
          width: 18,
          height: 18,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.brandSoft,
        }}
      >
        <VadText variant="caption" tone="brand">✓</VadText>
      </View>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}

function OutcomePill({ label, value, tone }: { label: string; value: string; tone: 'yes' | 'no' }) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        flex: 1,
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        paddingHorizontal: theme.spacing.md,
        backgroundColor: tone === 'yes' ? theme.colors.yesSoft : theme.colors.noSoft,
      }}
    >
      <VadText variant="caption" tone={tone}>{label}</VadText>
      <VadText variant="heading" tone={tone}>{value}</VadText>
    </View>
  );
}
