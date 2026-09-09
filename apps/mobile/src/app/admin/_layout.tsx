import { Redirect, router, Slot } from 'expo-router';
import { View } from 'react-native';

import { AdminWorkspaceHeader } from '@/features/admin/components/admin-workspace-header';
import { AdminWorkspaceNav } from '@/features/admin/components/admin-workspace-nav';
import { useAuth } from '@/providers/auth-provider';
import { AdminDataProvider } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AdminLayout() {
  const { isLoading, session } = useAuth();
  const theme = useVadTheme();

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  if (!session) return <Redirect href="/" />;

  return (
    <AdminDataProvider>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <AdminWorkspaceHeader
          title="VAD Operations"
          subtitle="Governance & control"
          backLabel="App"
          onBack={() => router.replace('/home')}
        />
        <AdminWorkspaceNav />
        <Slot />
      </View>
    </AdminDataProvider>
  );
}
