import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { AdminDashboardScreen } from '@/features/admin/dashboard/admin-dashboard-screen';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AdminDashboardRoute() {
  const theme = useVadTheme();
  const { session, isLoading } = useAuth();
  if (isLoading) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  if (!session) return <Redirect href="/" />;

  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <View style={{ paddingTop: 52, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface }}>
      <Pressable onPress={() => router.back()}><VadText variant="label" tone="brand">← VAD</VadText></Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}><VadText variant="heading">Admin</VadText><VadText variant="caption" tone="secondary">Control Plane</VadText></View>
      <Pressable onPress={() => router.push('/admin-operations')}><VadText variant="label" tone="brand">Operations</VadText></Pressable>
    </View>
    <View style={{ flex: 1, padding: theme.spacing.lg }}><AdminDashboardScreen /></View>
  </View>;
}
