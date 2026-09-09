import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { AdminWorkspaceHeader } from '@/features/admin/components/admin-workspace-header';
import { AdminDashboardScreen } from '@/features/admin/dashboard/admin-dashboard-screen';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AdminDashboardRoute() {
  const theme = useVadTheme();
  const { session, isLoading } = useAuth();

  if (isLoading) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  if (!session) return <Redirect href="/" />;

  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <AdminWorkspaceHeader
      title="VAD Admin"
      subtitle="Control Plane"
      backLabel="App"
      actionLabel="Operations"
      onBack={() => router.back()}
      onAction={() => router.push('/admin-operations')}
    />
    <View style={{ flex: 1, padding: theme.spacing.lg, maxWidth: 1180, width: '100%', alignSelf: 'center' }}>
      <AdminDashboardScreen />
    </View>
  </View>;
}
