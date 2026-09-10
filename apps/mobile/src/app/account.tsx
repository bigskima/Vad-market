import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadText } from '@/components/ui/vad-text';
import { ProductRoute } from '@/features/navigation/product-route';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AccountScreen() {
  const { session, signOut } = useAuth();
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const compact = width < 380;
  const email = session?.user.email ?? session?.user.phone ?? 'VAD member';
  const initial = email.trim().charAt(0).toUpperCase() || 'V';

  const appearance =
    theme.preference === 'system'
      ? 'System · currently ' + theme.mode
      : theme.preference.charAt(0).toUpperCase() +
        theme.preference.slice(1);

  return (
    <ProductRoute active="Account">
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: wide
          ? theme.spacing.xxxl
          : compact
            ? theme.spacing.xl
            : theme.spacing.xxl,
        }}
      >
        <View
          style={{
            width: wide ? '32%' : '100%',
            gap: theme.spacing.xl,
          }}
        >
          <View
            style={{
              flexDirection: wide ? 'column' : 'row',
              alignItems: wide ? 'flex-start' : 'center',
              gap: theme.spacing.md,
            }}
          >
            <View
              style={{
                width: 62,
                height: 62,
                borderRadius: 31,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.brandSoft,
                borderWidth: 1,
                borderColor: theme.colors.borderStrong,
              }}
            >
              <VadText variant="heading" tone="brand">{initial}</VadText>
            </View>

            <View style={{ flex: 1, gap: theme.spacing.xxs }}>
              <VadText variant="label" tone="brand">ACCOUNT</VadText>
              <VadText variant="title">Your VAD identity.</VadText>
              <VadText
                variant="caption"
                tone="secondary"
                numberOfLines={2}
              >
                {email}
              </VadText>
            </View>
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderBottomWidth: wide ? 0 : 1,
              borderColor: theme.colors.border,
              paddingVertical: theme.spacing.md,
              gap: theme.spacing.md,
            }}
          >
            <VadText variant="caption" tone="tertiary">
              Trading and money movement remain governed by live account,
              jurisdiction and verification policy.
            </VadText>

            <VadButton
              label="Sign out"
              variant="secondary"
              fullWidth={!wide}
              onPress={() => void signOut()}
            />
          </View>
        </View>

        <View
          style={{
            flex: 1,
            width: wide ? undefined : '100%',
            gap: theme.spacing.xl,
          }}
        >
          <SettingGroup
            title="Identity"
            subtitle="How you appear publicly and how VAD verifies your account."
          >
            <AccountRow
              title="Profile"
              subtitle="Public name, handle, photo and bio"
              onPress={() => router.push('/account/profile')}
            />
            <AccountRow
              title="Identity verification"
              subtitle="KYC status and verification provider"
              onPress={() => router.push('/account/verification')}
            />
          </SettingGroup>

          <SettingGroup
            title="Money & experience"
            subtitle="Funding controls and how VAD appears on this device."
          >
            <AccountRow
              title="Funding & withdrawals"
              subtitle="Payment readiness, limits, fees and activity"
              onPress={() => router.push('/account/funding')}
            />
            <AccountRow
              title="Appearance"
              subtitle={appearance}
              onPress={() => router.push('/account/appearance')}
            />
          </SettingGroup>
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
      <View style={{ gap: 2 }}>
        <VadText variant="heading">{title}</VadText>
        <VadText variant="caption" tone="secondary">{subtitle}</VadText>
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function AccountRow({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 76,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">{title}</VadText>
        <VadText variant="caption" tone="secondary">{subtitle}</VadText>
      </View>
      <VadText variant="label" tone="brand">Open</VadText>
    </Pressable>
  );
}
