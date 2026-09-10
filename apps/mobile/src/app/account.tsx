import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { ProductRoute } from '@/features/navigation/product-route';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AccountScreen() {
  const { session, signOut } = useAuth();
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const email = session?.user.email ?? session?.user.phone ?? 'VAD member';
  const initial = email.trim().charAt(0).toUpperCase() || 'V';
  const appearance = theme.preference === 'system' ? `System · currently ${theme.mode}` : theme.preference.charAt(0).toUpperCase() + theme.preference.slice(1);

  return (
    <ProductRoute active="Account">
      <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'flex-start', gap: theme.spacing.xl }}>
        <VadCard variant="brand" style={{ width: wide ? '32%' : '100%', gap: theme.spacing.lg }}>
          <View style={{ flexDirection: wide ? 'column' : 'row', alignItems: wide ? 'flex-start' : 'center', gap: theme.spacing.md }}>
            <View style={{ width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
              <VadText variant="title" tone="brand">{initial}</VadText>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="caption" tone="brand">ACCOUNT</VadText>
              <VadText variant="heading">Your VAD identity</VadText>
              <VadText variant="caption" tone="secondary" numberOfLines={2}>{email}</VadText>
            </View>
          </View>
          <VadText variant="caption" tone="tertiary">Trading and money movement remain governed by live account, jurisdiction and verification policy.</VadText>
          <VadButton label="Sign out" variant="secondary" onPress={() => void signOut()} />
        </VadCard>

        <View style={{ flex: 1, width: wide ? undefined : '100%', gap: theme.spacing.xl }}>
          <SettingGroup title="Identity" subtitle="Your public profile and verification status.">
            <AccountRow icon="account" title="Profile" subtitle="Name, handle, photo and bio" onPress={() => router.push('/account/profile')} />
            <AccountRow icon="operations" title="Identity verification" subtitle="KYC status and verification provider" onPress={() => router.push('/account/verification')} />
          </SettingGroup>

          <SettingGroup title="Money & experience" subtitle="Funding controls and how VAD appears on this device.">
            <AccountRow icon="wallet" title="Funding & withdrawals" subtitle="Readiness, limits, fees and activity" onPress={() => router.push('/account/funding')} />
            <AccountRow icon="markets" title="Appearance" subtitle={appearance} onPress={() => router.push('/account/appearance')} />
          </SettingGroup>
        </View>
      </View>
    </ProductRoute>
  );
}

function SettingGroup({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 2 }}>
        <VadText variant="heading">{title}</VadText>
        <VadText variant="caption" tone="secondary">{subtitle}</VadText>
      </View>
      <View style={{ gap: theme.spacing.sm }}>{children}</View>
    </View>
  );
}

function AccountRow({ icon, title, subtitle, onPress }: { icon: VadIconName; title: string; subtitle: string; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}>
      <VadCard variant="raised" style={{ minHeight: 82, paddingVertical: theme.spacing.md, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft }}>
          <VadIcon name={icon} size={20} tone="brand" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="bodyStrong">{title}</VadText>
          <VadText variant="caption" tone="secondary">{subtitle}</VadText>
        </View>
        <VadIcon name="chevronRight" size={18} tone="tertiary" />
      </VadCard>
    </Pressable>
  );
}
