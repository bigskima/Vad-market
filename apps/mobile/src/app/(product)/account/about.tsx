import Constants from 'expo-constants';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { VadCard } from '@/components/ui/vad-card';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { TourTarget } from '@/features/tour/tour-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AboutVadScreen() {
  const theme = useVadTheme();
  const version = Constants.expoConfig?.version ?? 'Not provided by this build';
  const appName = Constants.expoConfig?.name ?? 'VAD Market';
  return (
    <ProductSubpage title="About VAD Market" maxWidth={720}>
      <View style={{ gap: theme.spacing.md }}>
        <TourTarget id="about-vad">
        <VadCard variant="brand" style={{ gap: theme.spacing.sm, alignItems: 'flex-start' }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}>
            <VadIcon name="info" size={26} tone="brand" />
          </View>
          <VadText variant="title">{appName}</VadText>
          <VadText variant="caption" tone="secondary">Version {version}</VadText>
          <VadText variant="body" tone="secondary">VAD Market is a prediction market. Trading depends on your eligibility and VAD’s published rules.</VadText>
        </VadCard>
        </TourTarget>
        <Pressable accessibilityRole="button" onPress={() => router.push('/account/policies')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, opacity: pressed ? 0.75 : 1 })}>
          <VadIcon name="fileText" size={20} tone="brand" />
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="bodyStrong">Legal documents</VadText>
            <VadText variant="caption" tone="secondary">View VAD’s Terms, Privacy Policy and Risk Disclosures.</VadText>
          </View>
          <VadIcon name="chevronRight" size={16} tone="tertiary" />
        </Pressable>
      </View>
    </ProductSubpage>
  );
}
