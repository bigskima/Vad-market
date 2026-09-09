import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { VadLogo } from '@/components/brand/vad-logo';
import { KycCard } from '@/components/kyc-card';
import { PaymentReadinessCard } from '@/components/payment-readiness-card';
import { ProfileEditorCard } from '@/components/profile/profile-editor-card';
import { VadCard } from '@/components/ui/vad-card';
import { VadScreen } from '@/components/ui/vad-screen';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AccountOperationsScreen() {
  const { isLoading, session } = useAuth();
  const theme = useVadTheme();

  if (isLoading) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  if (!session) return <Redirect href="/" />;

  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <View style={{ paddingTop: 52, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surface }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ minWidth: 64, paddingVertical: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">← Back</VadText>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        <VadLogo size={28} />
        <VadText variant="bodyStrong">Account</VadText>
      </View>
      <View style={{ minWidth: 64 }} />
    </View>

    <VadScreen contentStyle={{ paddingTop: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xxs }}>
        <VadText variant="label" tone="brand">ACCOUNT CENTER</VadText>
        <VadText variant="title">Identity, trust and money</VadText>
        <VadText tone="secondary">Keep your public profile, verification state and funding readiness in one place.</VadText>
      </View>

      <VadCard variant="muted" style={{ flexDirection: 'row', gap: theme.spacing.xs, borderRadius: theme.radius.xl }}>
        <AccountPill label="Profile" />
        <AccountPill label="Verification" />
        <AccountPill label="Funding" />
      </VadCard>

      <View style={{ gap: theme.spacing.sm }}>
        <VadSectionHeader title="Your public identity" subtitle="Name, handle and profile media used across creator pages, conviction posts and comments." />
        <ProfileEditorCard />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <VadSectionHeader title="Identity and verification" subtitle="Verification level and capability are controlled by live compliance policy." />
        <KycCard />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <VadSectionHeader title="Funding and withdrawals" subtitle="Provider readiness, KYC, limits and ledger state govern money movement." />
        <PaymentReadinessCard />
        <VadCard variant="outlined" style={{ gap: theme.spacing.xs, borderRadius: theme.radius.lg }}>
          <VadText variant="label" tone="brand">PROVIDER STATUS</VadText>
          <VadText variant="bodyStrong">External payment route not selected</VadText>
          <VadText variant="caption" tone="secondary">VAD will not send funds to an external provider until a configured Nigeria/NGN route passes provider governance. The ledger remains the financial source of truth.</VadText>
        </VadCard>
      </View>
    </VadScreen>
  </View>;
}

function AccountPill({ label }: { label: string }) {
  const theme = useVadTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface }}>
    <VadText variant="caption" tone="secondary">{label}</VadText>
  </View>;
}
