import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { VadScreen } from '@/components/ui/vad-screen';
import { VadText } from '@/components/ui/vad-text';
import { AdminOperationsFeature } from '@/features/admin/operations/admin-operations-screen';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AdminOperationsRoute() {
  const { isLoading, session } = useAuth();
  const theme = useVadTheme();
  if (isLoading) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  if (!session) return <Redirect href="/" />;

  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <View style={{ paddingTop: 52, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surface }}>
      <Pressable onPress={() => router.back()}><VadText variant="label" tone="brand">← Account</VadText></Pressable>
      <VadText variant="heading">Operations</VadText>
      <View style={{ width: 64 }} />
    </View>
    <VadScreen contentStyle={{ paddingTop: theme.spacing.xl }}><AdminOperationsFeature /></VadScreen>
  </View>;
}
