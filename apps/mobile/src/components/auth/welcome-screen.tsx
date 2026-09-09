import { ScrollView, useWindowDimensions, View } from 'react-native';
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

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignSelf: 'center',
          width: '100%',
          maxWidth: 1080,
          paddingHorizontal: theme.spacing.lg,
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
          <VadLogo size={46} />
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
              gap: theme.spacing.lg,
            }}
          >
            <View
              style={{
                alignSelf: 'flex-start',
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.brandSoft,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.xs,
              }}
            >
              <VadText variant="caption" tone="brand">
                CONVICTION MARKET
              </VadText>
            </View>

            <View style={{ gap: theme.spacing.md }}>
              <VadText variant="display">Back what you believe.</VadText>
              <VadText tone="secondary">
                Explore live market probabilities, inspect the rules behind
                every market and take a position with transparent resolution.
              </VadText>
            </View>

            <View
              style={{
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
                  marginTop: theme.spacing.md,
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
              gap: theme.spacing.xl,
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
                height: 10,
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
                gap: theme.spacing.lg,
                flexWrap: 'wrap',
              }}
            >
              <SignalFact label="YES" value="64%" />
              <SignalFact label="NO" value="36%" />
            </View>

            <VadText variant="caption" tone="inverse">
              Market price reflects participant conviction. Final settlement
              follows the independent resolution process.
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
          jurisdiction, KYC and platform policy.
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
