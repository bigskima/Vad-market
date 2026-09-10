import { Redirect, router, Slot } from 'expo-router';
import { View } from 'react-native';

import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { AdminWorkspaceHeader } from '@/features/admin/components/admin-workspace-header';
import { AdminWorkspaceNav } from '@/features/admin/components/admin-workspace-nav';
import { useAuth } from '@/providers/auth-provider';
import { AdminDataProvider } from '@/providers/admin-data-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AdminLayout() {
  const { isLoading, session } = useAuth();
  const product = useProductDataContext();
  const theme = useVadTheme();

  if (isLoading || (session && product.adminLoading)) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.xxl,
          gap: theme.spacing.lg,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 1180,
            alignSelf: 'center',
            gap: theme.spacing.lg,
          }}
        >
          <VadSkeleton width={180} height={28} />
          <VadSkeleton height={48} />
          <VadSkeleton width="45%" height={32} />
          <VadSkeleton height={112} radius={theme.radius.xl} />
        </View>
      </View>
    );
  }

  if (!session) return <Redirect href="/" />;

  // The backend permission checks remain authoritative. This gate prevents a
  // signed-in non-operator from briefly seeing the Operations shell by typing
  // an admin URL directly.
  if (!product.adminSummary) return <Redirect href="/home" />;

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
