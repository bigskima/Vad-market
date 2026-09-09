import { ScrollView, View } from 'react-native';
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'space-between',
          alignSelf: 'center',
          width: '100%',
          maxWidth: 620,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.xxl,
          gap: theme.spacing.xxxl,
        }}
      >
        <View style={{ gap: theme.spacing.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <VadLogo size={52} />
            <View>
              <VadText variant="heading">VAD</VadText>
              <VadText variant="caption" tone="secondary">Value Asset Depot</VadText>
            </View>
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <View
              style={{
                alignSelf: 'flex-start',
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.brandSoft,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.xs,
              }}
            >
              <VadText variant="caption" tone="brand">CONVICTION MARKET</VadText>
            </View>
            <VadText variant="display">Back what you believe.</VadText>
            <VadText tone="secondary">
              Explore live market probabilities, inspect the rules behind every market and take a position with transparent resolution.
            </VadText>
          </View>

          <VadCard
            style={{
              backgroundColor: theme.colors.brandPrimary,
              borderColor: theme.colors.brandPrimary,
              borderRadius: theme.radius.xl,
              gap: theme.spacing.lg,
              padding: theme.spacing.xl,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}>
              <View style={{ flex: 1, gap: theme.spacing.xs }}>
                <VadText variant="caption" tone="inverse">Market signal</VadText>
                <VadText variant="heading" tone="inverse">Will the event resolve YES?</VadText>
              </View>
              <VadText variant="title" tone="inverse">64%</VadText>
            </View>
            <View style={{ height: 8, borderRadius: theme.radius.pill, overflow: 'hidden', backgroundColor: theme.colors.brandStrong }}>
              <View style={{ width: '64%', height: '100%', backgroundColor: theme.colors.onBrand }} />
            </View>
            <VadText variant="caption" tone="inverse">Fully collateralized · Governed resolution · Auditable ledger</VadText>
          </VadCard>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <VadButton label="Create account" onPress={() => onContinue('signUp')} />
          <VadButton label="I already have an account" variant="secondary" onPress={() => onContinue('signIn')} />
          <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center', marginTop: theme.spacing.xs }}>
            Market access and money movement remain subject to live jurisdiction, KYC and platform policy.
          </VadText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
