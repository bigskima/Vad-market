import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { VadLogo } from '@/components/brand/vad-logo';
import { KycCard } from '@/components/kyc-card';
import { PaymentReadinessCard } from '@/components/payment-readiness-card';
import { ProfileEditorCard } from '@/components/profile/profile-editor-card';
import { VadCard } from '@/components/ui/vad-card';
import { VadScreen } from '@/components/ui/vad-screen';
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
      <Pressable onPress={() => router.back()}><VadText variant="label" tone="brand">← Back</VadText></Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}><VadLogo size={30} /><VadText variant="heading">Account</VadText></View>
      <Pressable onPress={() => router.push('/admin')}><VadText variant="label" tone="brand">Admin</VadText></Pressable>
    </View>
    <VadScreen contentStyle={{ paddingTop: theme.spacing.xl }}>
      <ProfileEditorCard />
      <VadText variant="label" tone="brand">IDENTITY · FUNDING · WITHDRAWALS</VadText>
      <VadText variant="title">Your VAD account operations.</VadText>
      <VadText tone="secondary">Verification and money movement stay governed by live backend capability, KYC and provider policies.</VadText>
      <KycCard />
      <PaymentReadinessCard />
      <VadCard variant="outlined" style={{ gap: theme.spacing.xs }}><VadText variant="bodyStrong">Payment provider not selected yet</VadText><VadText tone="secondary">VAD will not send money to an external provider until a configured Nigeria/NGN route has passed provider governance. Your ledger remains the financial source of truth.</VadText></VadCard>
    </VadScreen>
  </View>;
}
