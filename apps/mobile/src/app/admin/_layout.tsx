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

type AdminAccessState = {
  userId: string;
  allowed: boolean;
};

export default function AdminLayout() {
  const { isLoading, session } = useAuth();
  const theme = useVadTheme();
  const userId = session?.user.id ?? null;
  const [access, setAccess] = useState<AdminAccessState | null>(null);

  useEffect(() => {
    if (!userId) return;

    let ignore = false;
    void getAdminRuntimeSummary()
      .then((summary) => {
        if (!ignore) {
          setAccess({ userId, allowed: Boolean(summary) });
        }
      })
      .catch(() => {
        if (!ignore) setAccess({ userId, allowed: false });
      });

    return () => {
      ignore = true;
    };
  }, [userId]);

  const accessChecking = Boolean(userId && access?.userId !== userId);
  const hasAdminAccess = Boolean(
    userId && access?.userId === userId && access.allowed,
  );

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
