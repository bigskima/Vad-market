import { Redirect, router, Slot } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { AdminWorkspaceHeader } from '@/features/admin/components/admin-workspace-header';
import { AdminWorkspaceNav } from '@/features/admin/components/admin-workspace-nav';
import { useAuth } from '@/providers/auth-provider';
import { AdminDataProvider } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { getAdminRuntimeSummary } from '@/services/market-api';

export default function AdminLayout() {
  const { isLoading, session } = useAuth();
  const theme = useVadTheme();
  const userId = session?.user.id ?? null;
  const [accessChecking, setAccessChecking] = useState(true);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);

  useEffect(() => {
    let ignore = false;

    if (!userId) {
      setHasAdminAccess(false);
      setAccessChecking(false);
      return () => {
        ignore = true;
      };
    }

    setAccessChecking(true);
    setHasAdminAccess(false);

    void getAdminRuntimeSummary()
      .then((summary) => {
        if (!ignore) setHasAdminAccess(Boolean(summary));
      })
      .catch(() => {
        if (!ignore) setHasAdminAccess(false);
      })
      .finally(() => {
        if (!ignore) setAccessChecking(false);
      });

    return () => {
      ignore = true;
    };
  }, [userId]);

  if (isLoading || (session && accessChecking)) {
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

  // Database RPC permission checks remain authoritative. This client-side gate
  // keeps a signed-in non-operator from seeing the Operations shell after
  // typing an admin URL directly.
  if (!hasAdminAccess) return <Redirect href="/home" />;

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
