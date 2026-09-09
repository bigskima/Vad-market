import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { VadScreen } from '@/components/ui/vad-screen';
import { AdminWorkspaceHeader } from '@/features/admin/components/admin-workspace-header';
import { AdminOperationsFeature } from '@/features/admin/operations/admin-operations-screen';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AdminOperationsRoute() {
  const { isLoading, session } = useAuth();
  const theme = useVadTheme();

  if (isLoading) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  if (!session) return <Redirect href="/" />;

  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <AdminWorkspaceHeader
      title="Operations"
      subtitle="Identity, providers & money"
      backLabel="Control plane"
      onBack={() => router.replace('/admin')}
    />
    <VadScreen contentStyle={{ paddingTop: theme.spacing.xl, maxWidth: 1180, width: '100%', alignSelf: 'center' }}>
      <AdminOperationsFeature />
    </VadScreen>
  </View>;
}
