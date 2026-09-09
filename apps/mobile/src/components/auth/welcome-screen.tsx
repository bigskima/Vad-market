import {
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
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const compact = width < 380;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          alignSelf: 'center',
          width: '100%',
          maxWidth: 1080,
          paddingHorizontal: compact
            ? theme.spacing.md
            : theme.spacing.lg,
          paddingVertical: theme.spacing.xxl,
          gap: theme.spacing.xxxl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <VadLogo size={44} />
          <View>
            <VadText variant="heading">VAD</VadText>
            <VadText variant="caption" tone="secondary">
              Value Asset Depot
            </VadText>
          </View>
        </View>

        <View
          style={{
            flex: 1,
            flexDirection: wide ? 'row' : 'column',
            alignItems: wide ? 'center' : 'stretch',
            justifyContent: 'center',
            gap: wide ? theme.spacing.xxxl : theme.spacing.xxl,
          }}
        >
          <View
            style={{
              flex: wide ? 1.1 : undefined,
              gap: theme.spacing.xl,
            }}
          >
            <View style={{ gap: theme.spacing.md }}>
              <VadText variant="label" tone="brand">
                CONVICTION MARKET
              </VadText>
              <VadText variant="display">Back what you believe.</VadText>
              <VadText tone="secondary">
                Explore live market probabilities, inspect the rules behind
                every question and take a position only when your conviction is
                stronger than the crowd.
              </VadText>
            </View>

            <View
              style={{
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: theme.colors.border,
                paddingVertical: theme.spacing.md,
                flexDirection: 'row',
                gap: theme.spacing.xl,
                flexWrap: 'wrap',
              }}
            >
              <TrustPoint value="Live" label="Probability" />
              <TrustPoint value="Auditable" label="Ledger" />
              <TrustPoint value="Governed" label="Resolution" />
            </View>

            {wide ? (
              <View
                style={{
                  maxWidth: 420,
                  gap: theme.spacing.sm,
                }}
              >
                <VadButton
                  label="Create account"
                  onPress={() => onContinue('signUp')}
                />
                <VadButton
                  label="Sign in"
                  variant="secondary"
                  onPress={() => onContinue('signIn')}
                />
              </View>
            ) : null}
          </View>

          <View
            style={{
              flex: wide ? 0.9 : undefined,
              borderRadius: theme.radius.xl,
              backgroundColor: theme.colors.brandPrimary,
              padding: theme.spacing.xl,
              gap: theme.spacing.lg,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: theme.spacing.md,
                alignItems: 'flex-start',
              }}
            >
              <View style={{ flex: 1, gap: theme.spacing.xs }}>
                <VadText variant="caption" tone="inverse">
                  MARKET SIGNAL
                </VadText>
                <VadText variant="heading" tone="inverse">
                  Will the event resolve YES?
                </VadText>
              </View>
              <VadText variant="title" tone="inverse">64%</VadText>
            </View>

            <View
              style={{
                height: 8,
                borderRadius: theme.radius.pill,
                overflow: 'hidden',
                backgroundColor: theme.colors.brandStrong,
              }}
            >
              <View
                style={{
                  width: '64%',
                  height: '100%',
                  backgroundColor: theme.colors.onBrand,
                }}
              />
            </View>

            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.xl,
                flexWrap: 'wrap',
              }}
            >
              <SignalFact label="YES" value="64%" />
              <SignalFact label="NO" value="36%" />
            </View>

            <VadText variant="caption" tone="inverse">
              Price shows participant conviction. Final settlement still follows
              the independent resolution process.
            </VadText>
          </View>
        </View>

        {!wide ? (
          <View style={{ gap: theme.spacing.sm }}>
            <VadButton
              label="Create account"
              onPress={() => onContinue('signUp')}
            />
            <VadButton
              label="I already have an account"
              variant="secondary"
              onPress={() => onContinue('signIn')}
            />
          </View>
        ) : null}

        <VadText
          variant="caption"
          tone="tertiary"
          style={{ textAlign: wide ? 'left' : 'center' }}
        >
          Market access and money movement remain subject to live
          jurisdiction, identity and platform policy.
        </VadText>
      </ScrollView>
    </SafeAreaView>
  );
}

function TrustPoint({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ minWidth: 92, gap: 2 }}>
      <VadText variant="bodyStrong">{value}</VadText>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
    </View>
  );
}

function SignalFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 86, gap: 2 }}>
      <VadText variant="caption" tone="inverse">{label}</VadText>
      <VadText variant="heading" tone="inverse">{value}</VadText>
    </View>
  );
}
