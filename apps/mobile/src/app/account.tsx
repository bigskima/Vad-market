import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadText } from '@/components/ui/vad-text';
import { ProductRoute } from '@/features/navigation/product-route';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AccountScreen() {
  const { session, signOut } = useAuth();
  const theme = useVadTheme();
  const email = session?.user.email ?? session?.user.phone ?? 'VAD member';
  const initial = email.trim().charAt(0).toUpperCase() || 'V';

  return (
    <ProductRoute active="Account">
      <View style={{ gap: theme.spacing.xxl }}>
        <View style={{ gap: theme.spacing.lg }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.brandSoft,
              borderWidth: 1,
              borderColor: theme.colors.borderStrong,
            }}
          >
            <VadText variant="title" tone="brand">{initial}</VadText>
          </View>
          <View style={{ gap: theme.spacing.xxs }}>
            <VadText variant="label" tone="brand">ACCOUNT</VadText>
            <VadText variant="title">Your VAD identity.</VadText>
            <VadText tone="secondary">{email}</VadText>
          </View>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
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
          <AccountRow
            title="Funding & withdrawals"
            subtitle="Payment provider readiness, limits and fees"
            onPress={() => router.push('/account/funding')}
          />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <VadText variant="caption" tone="tertiary">
            Trading, wallet access and money movement remain governed by live account, jurisdiction and verification policy.
          </VadText>
          <VadButton
            label="Sign out"
            variant="secondary"
            onPress={() => void signOut()}
          />
        </View>
      </View>
    </ProductRoute>
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
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 78,
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
      <VadText variant="heading" tone="tertiary">›</VadText>
    </Pressable>
  );
}
