import { Redirect, router, Slot } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { AdminShell } from '@/features/admin/components/admin-shell';
import { useAuth } from '@/providers/auth-provider';
import { AdminDataProvider } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminAccess,
  type AdminAccess,
} from '@/services/admin-control-api';

type AccessProbe = {
  userId: string;
  access: AdminAccess;
};

const noAccess: AdminAccess = {
  roles: [],
  permissions: [],
  isSuperAdmin: false,
};

export default function AdminLayout() {
  const { isLoading, session } = useAuth();
  const theme = useVadTheme();
  const userId = session?.user.id ?? null;
  const [probe, setProbe] = useState<AccessProbe | null>(null);

  useEffect(() => {
    if (!userId) return;

    let ignore = false;
    void getAdminAccess()
      .then((access) => {
        if (!ignore) setProbe({ userId, access });
      })
      .catch(() => {
        if (!ignore) setProbe({ userId, access: noAccess });
      });

    return () => {
      ignore = true;
    };
  }, [userId]);

  const accessChecking = Boolean(userId && probe?.userId !== userId);
  const access = probe?.userId === userId ? probe.access : noAccess;
  const hasAdminAccess = access.isSuperAdmin || access.roles.length > 0;

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

  // Navigation visibility is permission-scoped, while every privileged action
  // remains backend-authoritative through its own RPC authorization checks.
  if (!hasAdminAccess) return <Redirect href="/home" />;

  return (
    <AdminDataProvider access={access}>
      <AdminShell onExit={() => router.replace('/home')}>
        <Slot />
      </AdminShell>
    </AdminDataProvider>
  );
}
