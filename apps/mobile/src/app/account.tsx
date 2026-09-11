import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadText } from '@/components/ui/vad-text';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDensity } from '@/hooks/use-product-density';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AccountScreen() {
  const { session, signOut } = useAuth();
  const theme = useVadTheme();
  const density = useProductDensity();
  const email = session?.user.email ?? session?.user.phone ?? 'VAD member';
  const displayName = typeof session?.user.user_metadata?.display_name === 'string'
    ? session.user.user_metadata.display_name.trim()
    : '';
  const identity = displayName || email;
  const initial = identity.trim().charAt(0).toUpperCase() || 'V';
  const appearance = theme.preference === 'system'
    ? `System · currently ${theme.mode}`
    : theme.preference.charAt(0).toUpperCase() + theme.preference.slice(1);
  const sideBySide = density.wide;

  return (
    <ProductRoute active="Account">
      <View style={{ gap: density.sectionGap }}>
        <VadSectionHeader
          title="Account"
          subtitle="Manage your profile, verification, funding and appearance settings."
        />

        <View
          style={{
            flexDirection: sideBySide ? 'row' : 'column',
            alignItems: 'flex-start',
            gap: theme.spacing.xl,
          }}
        >
          <VadCard
            variant="brand"
            style={{
              width: sideBySide ? '34%' : '100%',
              gap: theme.spacing.lg,
              padding: density.phone ? theme.spacing.lg : theme.spacing.xl,
            }}
          >
            <View
              style={{
                flexDirection: sideBySide ? 'column' : 'row',
                alignItems: sideBySide ? 'flex-start' : 'center',
                gap: theme.spacing.md,
              }}
            >
              <View
                style={{
                  width: density.phone ? 58 : 68,
                  height: density.phone ? 58 : 68,
                  borderRadius: 34,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <VadText variant="title" tone="brand">{initial}</VadText>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <VadText variant="caption" tone="brand">YOUR ACCOUNT</VadText>
                <VadText variant="heading" numberOfLines={2}>{displayName || 'Your VAD account'}</VadText>
                <VadText variant="caption" tone="secondary" numberOfLines={2}>{email}</VadText>
              </View>
            </View>

            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
                paddingTop: theme.spacing.md,
                gap: theme.spacing.xs,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                <VadIcon name="operations" size={16} tone="brand" />
                <VadText variant="caption" tone="brand">ACCOUNT ACCESS</VadText>
              </View>
              <VadText variant="caption" tone="secondary">
                Some features may require identity verification and may not be available in every location.
              </VadText>
            </View>

            <VadButton label="Sign out" variant="secondary" onPress={() => void signOut()} />
          </VadCard>

          <View style={{ flex: 1, width: sideBySide ? undefined : '100%', gap: density.sectionGap }}>
            <SettingGroup title="Identity" subtitle="Manage how you appear on VAD and your verification status.">
              <AccountRow
                icon="account"
                title="Public profile"
                subtitle="Name, username, photo, banner and bio"
                onPress={() => router.push('/account/profile')}
              />
              <AccountRow
                icon="operations"
                title="Identity verification"
                subtitle="Verification status and next step"
                onPress={() => router.push('/account/verification')}
              />
            </SettingGroup>

            <SettingGroup title="Money & experience" subtitle="Manage funding access and how VAD looks on this device.">
              <AccountRow
                icon="wallet"
                title="Funding & withdrawals"
                subtitle="Availability, limits, fees and payment activity"
                onPress={() => router.push('/account/funding')}
              />
              <AccountRow
                icon="markets"
                title="Appearance"
                subtitle={appearance}
                onPress={() => router.push('/account/appearance')}
              />
            </SettingGroup>
          </View>
        </View>
      </View>
    </ProductRoute>
  );
}

function SettingGroup({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <VadSectionHeader title={title} subtitle={subtitle} />
      <View style={{ gap: theme.spacing.sm }}>{children}</View>
    </View>
  );
}

function AccountRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: VadIconName;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
        transform: [{ scale: pressed ? 0.992 : 1 }],
      })}
    >
      <VadCard
        variant="raised"
        style={{
          minHeight: density.phone ? 78 : 86,
          paddingVertical: theme.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.brandSoft,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <VadIcon name={icon} size={20} tone="brand" />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <VadText variant="bodyStrong">{title}</VadText>
          <VadText variant="caption" tone="secondary">{subtitle}</VadText>
        </View>
        <VadIcon name="chevronRight" size={18} tone="tertiary" />
      </VadCard>
    </Pressable>
  );
}
